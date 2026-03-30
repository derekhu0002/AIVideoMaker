from __future__ import annotations

import os
import json
import mimetypes
import shutil
import subprocess
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from .opencode_bridge import run_opencode_bridge
from .constants import WEB_DIR
from .storage import (
    AppDomainError,
    add_asset,
    append_audit_event,
    append_system_event,
    confirm_artifact,
    create_export_package,
    create_manual_publish_handoff,
    create_media_output,
    create_project,
    create_export_package,
    ensure_stage_mutable,
    get_project,
    list_projects,
    normalize_editor_content,
    record_launch_evidence,
    read_audit_events,
    record_artifact_version,
    write_runtime_acceptance_checklist,
    refresh_project_status,
    save_project,
)
from .workflow import run_generation


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "API_ERROR", details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.details = details or {}


class AppHandler(BaseHTTPRequestHandler):
    server_version = "AIVideoMakerMVP/0.1"

    def _response_envelope(self, *, ok: bool, data: dict | None = None, error: dict | None = None) -> dict:
        return {"ok": ok, "data": data or {}, "error": error}

    def _request_context(self) -> dict:
        return {
            "method": self.command,
            "path": self.path,
            "client": self.client_address[0] if self.client_address else None,
        }

    def _handle_exception(self, error: Exception) -> None:
        if isinstance(error, AppDomainError):
            append_system_event("warning", "domain_error", {**self._request_context(), "code": error.code, "message": error.message})
            self.respond_json(
                self._response_envelope(
                    ok=False,
                    error={"code": error.code, "message": error.message, "details": error.details},
                ),
                status=error.status,
            )
            return
        if isinstance(error, ApiError):
            append_system_event("warning", "api_error", {**self._request_context(), "code": error.code, "message": error.message})
            self.respond_json(
                self._response_envelope(
                    ok=False,
                    error={"code": error.code, "message": error.message, "details": error.details},
                ),
                status=error.status,
            )
            return

        append_system_event("error", "unhandled_exception", {**self._request_context(), "message": str(error)})
        self.respond_json(
            self._response_envelope(
                ok=False,
                error={"code": "INTERNAL_SERVER_ERROR", "message": "Internal server error", "details": {}},
            ),
            status=500,
        )

    def do_GET(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"):
                self.handle_api_get(parsed.path)
                return
            self.serve_static(parsed.path)
        except Exception as error:  # pragma: no cover - safety net
            self._handle_exception(error)

    def do_POST(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            if not parsed.path.startswith("/api/"):
                raise ApiError("Not found", 404, code="NOT_FOUND")
            self.handle_api_post(parsed.path)
        except Exception as error:  # pragma: no cover - safety net
            self._handle_exception(error)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            return json.loads(raw or "{}")
        except json.JSONDecodeError as error:
            raise ApiError("Invalid JSON body", 400, code="INVALID_JSON", details={"reason": str(error)}) from error

    def respond_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path: str) -> None:
        relative_path = "index.html" if path in {"/", ""} else path.lstrip("/")
        file_path = WEB_DIR / relative_path
        if not file_path.exists() or not file_path.is_file():
            raise ApiError("Not found", 404, code="NOT_FOUND")
        content = file_path.read_bytes()
        content_type, _ = mimetypes.guess_type(str(file_path))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type or 'text/plain'}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def handle_api_get(self, path: str) -> None:
        segments = [item for item in path.split("/") if item]
        if segments == ["api", "health"]:
            self.respond_json(self._response_envelope(ok=True, data={"service": "local-ai-video-maker-mvp"}))
            return
        if segments == ["api", "projects"]:
            self.respond_json(self._response_envelope(ok=True, data={"projects": list_projects()}))
            return
        if len(segments) == 3 and segments[:2] == ["api", "projects"]:
            project = refresh_project_status(get_project(segments[2]))
            save_project(project)
            self.respond_json(self._response_envelope(ok=True, data={"project": project, "logs": read_audit_events(segments[2])}))
            return
        if len(segments) == 4 and segments[:2] == ["api", "projects"] and segments[3] == "logs":
            get_project(segments[2])
            self.respond_json(self._response_envelope(ok=True, data={"logs": read_audit_events(segments[2])}))
            return
        raise ApiError("Not found", 404, code="NOT_FOUND")

    def handle_api_post(self, path: str) -> None:
        segments = [item for item in path.split("/") if item]
        payload = self.read_json_body()

        if segments == ["api", "projects"]:
            project = create_project(payload)
            self.respond_json(self._response_envelope(ok=True, data={"project": project}), status=201)
            return

        if len(segments) < 3 or segments[:2] != ["api", "projects"]:
            raise ApiError("Not found", 404, code="NOT_FOUND")

        project_id = segments[2]
        project = get_project(project_id)

        if len(segments) == 4 and segments[3] == "generate":
            target_stage = payload.get("stage")
            if target_stage and target_stage not in project["artifacts"]:
                raise ApiError("Unknown stage", 400, code="UNKNOWN_STAGE", details={"stage": target_stage})
            project, workflow_run = run_generation(project, target_stage=target_stage, reason=str(payload.get("reason") or ""))
            refresh_project_status(project)
            save_project(project)
            self.respond_json(self._response_envelope(ok=True, data={"project": project, "workflowRun": workflow_run}))
            return

        if len(segments) == 4 and segments[3] == "generate-with-bridge":
            bridge_run = run_opencode_bridge(project, prompt=str(payload.get("prompt") or "Generate project guidance for main flow."))
            if bridge_run["status"] == "passed" and bridge_run.get("result", {}).get("status") == "ok":
                bridge_summary = bridge_run["result"]
                project, workflow_run = run_generation(project, reason=f"sandbox-bridge:{bridge_summary.get('recommendedNextStep', 'main flow generation')}")
                workflow_run["bridgeRunId"] = bridge_run["id"]
                workflow_run["bridgeSummary"] = bridge_summary
                append_audit_event(project_id, "generate_with_bridge_completed", {"bridgeRunId": bridge_run["id"], "workflowRunId": workflow_run["id"]})
            else:
                project, workflow_run = run_generation(project, reason="sandbox bridge unavailable, fallback to stub generation")
                workflow_run["bridgeFallback"] = True
                workflow_run["bridgeRunId"] = bridge_run["id"]
                append_audit_event(project_id, "generate_with_bridge_fallback", {"bridgeRunId": bridge_run["id"], "workflowRunId": workflow_run["id"]})
            refresh_project_status(project)
            save_project(project)
            self.respond_json(self._response_envelope(ok=True, data={"project": project, "workflowRun": workflow_run, "bridgeRun": bridge_run}))
            return

        if len(segments) == 4 and segments[3] == "assets":
            asset = add_asset(project, payload)
            save_project(project)
            self.respond_json(self._response_envelope(ok=True, data={"project": project, "asset": asset}), status=201)
            return

        if len(segments) == 4 and segments[3] == "media-export":
            media_output = create_media_output(project, payload)
            refresh_project_status(project)
            save_project(project)
            self.respond_json(self._response_envelope(ok=True, data={"project": project, "mediaOutput": media_output}))
            return

        if len(segments) == 4 and segments[3] == "runtime-bridge-run":
            bridge_run = run_opencode_bridge(project, prompt=str(payload.get("prompt") or ""))
            refresh_project_status(project)
            save_project(project)
            self.respond_json(self._response_envelope(ok=True, data={"project": project, "bridgeRun": bridge_run}))
            return

        if len(segments) == 4 and segments[3] == "export-package":
            export_payload = create_export_package(project)
            refresh_project_status(project)
            save_project(project)
            self.respond_json(self._response_envelope(ok=True, data={"project": project, "exportPackage": export_payload}))
            return

        if len(segments) == 4 and segments[3] == "manual-publish-handoff":
            handoff = create_manual_publish_handoff(project, payload)
            checklist = write_runtime_acceptance_checklist(project)
            refresh_project_status(project)
            save_project(project)
            self.respond_json(self._response_envelope(ok=True, data={"project": project, "handoff": handoff, "acceptanceChecklist": checklist}))
            return

        if len(segments) == 4 and segments[3] == "manual-launch":
            action = str(payload.get("action") or "open_export_dir")
            target_path = str(payload.get("targetPath") or "")
            launch_status = "recorded_only"
            note = ""
            if action == "open_export_dir" and not target_path:
                target_path = os.path.join(os.getcwd(), "data", "projects", project_id, "exports")
                action = "open_path"
            if action == "open_handoff_html" and not target_path:
                handoff = project.get("publishing", {}).get("handoffRecords", [])
                target_path = handoff[0].get("checklistHtmlPath", "") if handoff else ""
                action = "open_path"
            if action == "open_path" and target_path:
                if os.name == "nt":
                    subprocess.run(["explorer", target_path], check=False)
                    launch_status = "opened"
                else:
                    open_cmd = shutil.which("xdg-open")
                    if open_cmd:
                        subprocess.run([open_cmd, target_path], check=False)
                        launch_status = "opened"
                    else:
                        note = "No desktop opener available; recorded fallback only."
            elif action == "copy_publish_copy":
                launch_status = "copy_ready"
                note = str(payload.get("note") or "Copy text prepared in UI.")
            evidence = record_launch_evidence(project, {"action": action, "targetPath": target_path, "status": launch_status, "note": note})
            save_project(project)
            self.respond_json(self._response_envelope(ok=True, data={"project": project, "launchEvidence": evidence}))
            return

        if len(segments) == 6 and segments[3] == "artifacts":
            stage_key = segments[4]
            action = segments[5]
            if stage_key not in project["artifacts"]:
                raise ApiError("Unknown stage", 400, code="UNKNOWN_STAGE", details={"stage": stage_key})

            if action == "edit":
                ensure_stage_mutable(project, stage_key, force_unlock=bool(payload.get("forceUnlock")), reason="manual edit")
                content = normalize_editor_content(payload.get("content"))
                entry = record_artifact_version(
                    project,
                    stage_key,
                    content,
                    source="user_edit",
                    actor=str(payload.get("editor") or "LocalCreator"),
                    note=str(payload.get("note") or "manual edit"),
                    agent_run_id=None,
                )
                append_audit_event(project_id, "artifact_edited", {"stageKey": stage_key, "version": entry["version"]})
                refresh_project_status(project)
                save_project(project)
                self.respond_json(self._response_envelope(ok=True, data={"project": project, "artifactVersion": entry}))
                return

            if action == "confirm":
                confirmation = confirm_artifact(
                    project,
                    stage_key,
                    reviewer=str(payload.get("reviewer") or "本地创作者"),
                    note=str(payload.get("note") or "确认可进入下一步"),
                )
                refresh_project_status(project)
                save_project(project)
                self.respond_json(self._response_envelope(ok=True, data={"project": project, "confirmation": confirmation}))
                return

            if action == "regenerate":
                ensure_stage_mutable(project, stage_key, force_unlock=bool(payload.get("forceUnlock")), reason="manual regenerate")
                project, workflow_run = run_generation(project, target_stage=stage_key, reason=str(payload.get("reason") or "manual regenerate"))
                refresh_project_status(project)
                save_project(project)
                self.respond_json(self._response_envelope(ok=True, data={"project": project, "workflowRun": workflow_run}))
                return

        raise ApiError("Not found", 404, code="NOT_FOUND")


def create_server(host: str = "127.0.0.1", port: int = 8005) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), AppHandler)


def run_server(host: str = "127.0.0.1", port: int = 8005) -> None:
    server = create_server(host, port)
    print(f"AI Video Maker MVP running at http://{host}:{port}")
    server.serve_forever()
