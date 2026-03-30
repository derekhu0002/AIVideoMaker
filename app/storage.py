from __future__ import annotations

import json
import html
import re
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from .constants import BASE_DIR, MANUAL_PUBLISH_RULE, PROJECTS_DIR, STAGE_DEFINITIONS, STAGE_KEYS, STAGE_MAP


class AppDomainError(Exception):
    def __init__(self, code: str, message: str, status: int, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}


class NotFoundError(AppDomainError):
    def __init__(self, message: str, code: str = "NOT_FOUND", details: dict[str, Any] | None = None):
        super().__init__(code=code, message=message, status=404, details=details)


class ValidationError(AppDomainError):
    def __init__(self, message: str, code: str = "VALIDATION_ERROR", details: dict[str, Any] | None = None):
        super().__init__(code=code, message=message, status=400, details=details)


class ConflictError(AppDomainError):
    def __init__(self, message: str, code: str = "CONFLICT", details: dict[str, Any] | None = None):
        super().__init__(code=code, message=message, status=409, details=details)


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def ensure_data_dirs() -> None:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


def system_log_file() -> Path:
    return BASE_DIR / "data" / "system" / "server-events.jsonl"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return slug or "project"


def project_id_from_name(name: str) -> str:
    return f"{slugify(name)[:24]}-{uuid4().hex[:8]}"


def read_json(file_path: Path, default: Any = None) -> Any:
    if not file_path.exists():
        return deepcopy(default)
    raw = file_path.read_text(encoding="utf-8").strip()
    if not raw:
        return deepcopy(default)
    return json.loads(raw)


def write_json(file_path: Path, payload: Any) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def append_jsonl(file_path: Path, payload: dict[str, Any]) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with file_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id


def project_file(project_id: str) -> Path:
    return project_dir(project_id) / "project.json"


def artifact_version_file(project_id: str, stage_key: str, version: int) -> Path:
    return project_dir(project_id) / "artifacts" / stage_key / f"v{version}.json"


def workflow_run_file(project_id: str, run_id: str) -> Path:
    return project_dir(project_id) / "workflow-runs" / f"{run_id}.json"


def audit_file(project_id: str) -> Path:
    return project_dir(project_id) / "audit" / "events.jsonl"


def export_file(project_id: str, version: int) -> Path:
    return project_dir(project_id) / "exports" / f"publish-package-v{version}.json"


def media_export_file(project_id: str, version: int) -> Path:
    return project_dir(project_id) / "exports" / f"final-cut-v{version}.json"


def handoff_file(project_id: str, version: int) -> Path:
    return project_dir(project_id) / "exports" / f"manual-publish-handoff-v{version}.json"


def handoff_html_file(project_id: str, version: int) -> Path:
    return project_dir(project_id) / "exports" / f"manual-publish-handoff-v{version}.html"


def acceptance_checklist_file(project_id: str) -> Path:
    return project_dir(project_id) / "runtime-bridge" / "acceptance-checklist.md"


def acceptance_sample_file(project_id: str) -> Path:
    return project_dir(project_id) / "runtime-bridge" / "acceptance-sample.json"


def walkthrough_file(project_id: str) -> Path:
    return project_dir(project_id) / "runtime-bridge" / "demo-walkthrough.md"


def runtime_bridge_dir(project_id: str) -> Path:
    return project_dir(project_id) / "runtime-bridge"


def runtime_bridge_run_dir(project_id: str, run_id: str) -> Path:
    return runtime_bridge_dir(project_id) / run_id


def append_system_event(level: str, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    event = {
        "id": f"sys-{uuid4().hex[:10]}",
        "level": level,
        "type": event_type,
        "timestamp": now_iso(),
        "payload": payload,
    }
    append_jsonl(system_log_file(), event)
    return event


def render_publish_handoff_html(project: dict[str, Any], handoff: dict[str, Any], package: dict[str, Any], media_output: dict[str, Any]) -> str:
    checklist_html = "".join(f"<li>{html.escape(str(item))}</li>" for item in handoff.get("checklist") or [])
    hashtags = " ".join(package.get("hashtags") or [])
    return f"""<!doctype html>
<html lang=\"zh-CN\">
  <head>
    <meta charset=\"utf-8\" />
    <title>{html.escape(project['name'])} - 人工发布交接清单</title>
    <style>
      body {{ font-family: sans-serif; margin: 32px; background: #0f172a; color: #e2e8f0; }}
      .card {{ border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 16px; background: #111827; }}
      code, pre {{ white-space: pre-wrap; background: #020617; padding: 8px; border-radius: 8px; display: block; }}
      a {{ color: #86efac; }}
    </style>
  </head>
  <body>
    <h1>{html.escape(project['name'])} · 人工发布交接清单</h1>
    <div class=\"card\">
      <strong>平台：</strong> 抖音<br />
      <strong>边界：</strong> 仅人工确认发布，禁止无确认自动直发<br />
      <strong>交接版本：</strong> V{handoff['version']}<br />
      <strong>发布包版本：</strong> V{handoff['packageVersion']}<br />
      <strong>成片导出版本：</strong> V{handoff['mediaOutputVersion']}
    </div>
    <div class=\"card\">
      <h2>发布文案</h2>
      <pre>{html.escape(str(package.get('title') or ''))}\n\n{html.escape(str(package.get('description') or ''))}\n\n{html.escape(hashtags)}</pre>
    </div>
    <div class=\"card\">
      <h2>人工检查清单</h2>
      <ol>{checklist_html}</ol>
    </div>
    <div class=\"card\">
      <h2>本地导出物</h2>
      <ul>
        <li>成片包：{html.escape(str(media_output.get('outputPath') or ''))}</li>
        <li>媒体清单：{html.escape(str(media_output.get('manifestPath') or ''))}</li>
        <li>字幕文件：{html.escape(str(media_output.get('subtitlePath') or ''))}</li>
      </ul>
    </div>
  </body>
</html>
"""


def write_runtime_acceptance_checklist(project: dict[str, Any]) -> dict[str, Any]:
    bridge_runs = project.get("runtimeBridgeRuns", [])
    latest = bridge_runs[0] if bridge_runs else None
    checklist = f"""# Isolated Runtime Acceptance Checklist

- Project ID: {project['id']}
- Latest bridge run: {latest['id'] if latest else 'N/A'}
- Bridge status: {latest['status'] if latest else 'N/A'}
- Main workspace runtime touched: false
- Manual publish only: {project.get('publishing', {}).get('manualPublishOnly', True)}
- Auto publish implemented: false

## Evidence

- Bridge manifest: {latest['manifestPath'] if latest else 'N/A'}
- Bridge stdout: {latest['stdoutPath'] if latest else 'N/A'}
- Bridge stderr: {latest['stderrPath'] if latest else 'N/A'}
- Latest media output: {project.get('mediaOutputs', [{}])[0].get('manifestPath') if project.get('mediaOutputs') else 'N/A'}
- Latest handoff html: {project.get('publishing', {}).get('handoffRecords', [{}])[0].get('checklistHtmlPath') if project.get('publishing', {}).get('handoffRecords') else 'N/A'}
"""
    file_path = acceptance_checklist_file(project["id"])
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(checklist, encoding="utf-8")
    sample_path = acceptance_sample_file(project["id"])
    write_json(
        sample_path,
        {
            "projectId": project["id"],
            "generatedAt": now_iso(),
            "bridgeRun": latest,
            "mediaOutput": project.get("mediaOutputs", [None])[0],
            "handoff": project.get("publishing", {}).get("handoffRecords", [None])[0],
        },
    )
    walkthrough_path = walkthrough_file(project["id"])
    walkthrough_path.write_text(
        "\n".join(
            [
                f"# {project['name']} 端到端演示走查",
                "",
                "1. 打开项目并执行桥接驱动生成。",
                "2. 检查 runtime bridge 结果、stdout/stderr 与 manifest。",
                "3. 逐项确认阶段产物，并观察锁定/失效状态。",
                "4. 生成 media export，并打开 export bundle HTML。",
                "5. 生成 publish package 与 handoff HTML。",
                "6. 仅执行人工确认发布，不执行任何自动直发。",
                "",
                f"Acceptance checklist: {file_path}",
                f"Acceptance sample: {sample_path}",
            ]
        ),
        encoding="utf-8",
    )
    payload = {"path": str(file_path), "updatedAt": now_iso()}
    append_audit_event(project["id"], "runtime_acceptance_checklist_written", payload)
    return payload


def create_empty_artifacts() -> dict[str, Any]:
    artifacts: dict[str, Any] = {}
    for stage in STAGE_DEFINITIONS:
        artifacts[stage["key"]] = {
            "key": stage["key"],
            "label": stage["label"],
            "status": "draft",
            "currentVersion": 0,
            "confirmedVersion": None,
            "currentContent": None,
            "versions": [],
            "lastAgent": stage["agent"],
            "lastUpdatedAt": None,
            "confirmationRequired": True,
            "locked": False,
            "reviewState": "idle",
            "invalidatedBy": None,
        }
    return artifacts


def create_project(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_data_dirs()
    name = str(payload.get("name") or "未命名项目").strip()
    project_id = project_id_from_name(name)
    now = now_iso()
    brief = {
        "topic": str(payload.get("topic") or "").strip(),
        "audience": str(payload.get("audience") or "").strip(),
        "style": str(payload.get("style") or "").strip(),
        "durationSeconds": int(payload.get("durationSeconds") or 30),
        "goal": str(payload.get("goal") or "").strip(),
        "notes": str(payload.get("notes") or "").strip(),
        "platform": "douyin",
        "manualPublishRule": MANUAL_PUBLISH_RULE,
    }
    project = {
        "id": project_id,
        "name": name,
        "slug": slugify(name),
        "createdAt": now,
        "updatedAt": now,
        "status": "draft",
        "brief": brief,
        "artifacts": create_empty_artifacts(),
        "assets": [],
        "confirmationRecords": [],
        "exportPackages": [],
        "mediaOutputs": [],
        "publishing": {
            "manualPublishOnly": True,
            "status": "not_ready",
            "latestPackageVersion": None,
            "latestMediaOutputVersion": None,
            "latestHandoffVersion": None,
            "handoffRecords": [],
        },
        "workflow": {
            "state": "idle",
            "pausedForConfirmation": False,
            "currentStage": None,
            "runCount": 0,
            "lastRunId": None,
            "history": [],
            "agentTeam": [stage["agent"] for stage in STAGE_DEFINITIONS],
            "lastError": None,
        },
    }
    save_project(project)
    append_audit_event(project_id, "project_created", {"brief": brief})
    return project


def ensure_project_schema(project: dict[str, Any]) -> dict[str, Any]:
    project.setdefault("assets", [])
    project.setdefault("confirmationRecords", [])
    project.setdefault("exportPackages", [])
    project.setdefault("mediaOutputs", [])
    project.setdefault("runtimeBridgeRuns", [])
    project.setdefault(
        "publishing",
        {
            "manualPublishOnly": True,
            "status": "not_ready",
            "latestPackageVersion": None,
            "latestMediaOutputVersion": None,
            "latestHandoffVersion": None,
            "handoffRecords": [],
        },
    )
    project["publishing"].setdefault("manualPublishOnly", True)
    project["publishing"].setdefault("status", "not_ready")
    project["publishing"].setdefault("latestPackageVersion", None)
    project["publishing"].setdefault("latestMediaOutputVersion", None)
    project["publishing"].setdefault("latestHandoffVersion", None)
    project["publishing"].setdefault("handoffRecords", [])
    for stage_key in STAGE_KEYS:
        artifact = project["artifacts"][stage_key]
        artifact.setdefault("locked", False)
        artifact.setdefault("reviewState", "idle")
        artifact.setdefault("invalidatedBy", None)
    project.setdefault("workflow", {})
    project["workflow"].setdefault("lastError", None)
    return project


def list_projects() -> list[dict[str, Any]]:
    ensure_data_dirs()
    projects: list[dict[str, Any]] = []
    for entry in PROJECTS_DIR.iterdir():
        if not entry.is_dir():
            continue
        project = read_json(entry / "project.json", default=None)
        if not project:
            continue
        ensure_project_schema(project)
        projects.append(summarize_project(project))
    projects.sort(key=lambda item: item.get("updatedAt", ""), reverse=True)
    return projects


def get_project(project_id: str) -> dict[str, Any]:
    project = read_json(project_file(project_id), default=None)
    if not project:
        raise NotFoundError(
            f"Project not found: {project_id}",
            code="PROJECT_NOT_FOUND",
            details={"projectId": project_id},
        )
    return ensure_project_schema(project)


def save_project(project: dict[str, Any]) -> dict[str, Any]:
    ensure_project_schema(project)
    project["updatedAt"] = now_iso()
    write_json(project_file(project["id"]), project)
    return project


def append_audit_event(project_id: str, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    event = {
        "id": f"evt-{uuid4().hex[:10]}",
        "type": event_type,
        "timestamp": now_iso(),
        "payload": payload,
    }
    append_jsonl(audit_file(project_id), event)
    return event


def read_audit_events(project_id: str) -> list[dict[str, Any]]:
    file_path = audit_file(project_id)
    if not file_path.exists():
        return []
    lines = [line for line in file_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return [json.loads(line) for line in reversed(lines)]


def get_current_version_entry(project: dict[str, Any], stage_key: str) -> dict[str, Any] | None:
    versions = project["artifacts"][stage_key]["versions"]
    return versions[-1] if versions else None


def record_artifact_version(
    project: dict[str, Any],
    stage_key: str,
    content: Any,
    *,
    source: str,
    actor: str,
    note: str,
    agent_run_id: str | None,
) -> dict[str, Any]:
    artifact = project["artifacts"][stage_key]
    version = int(artifact["currentVersion"]) + 1
    entry = {
        "version": version,
        "content": content,
        "source": source,
        "actor": actor,
        "note": note,
        "createdAt": now_iso(),
        "agentRunId": agent_run_id,
    }
    artifact["currentVersion"] = version
    artifact["currentContent"] = content
    artifact["confirmedVersion"] = None
    artifact["status"] = "edited" if source == "user_edit" else "generated"
    artifact["lastUpdatedAt"] = entry["createdAt"]
    artifact["lastAgent"] = actor
    artifact["confirmationRequired"] = True
    artifact["locked"] = False
    artifact["reviewState"] = "pending_review"
    artifact["invalidatedBy"] = None
    artifact["versions"].append(entry)
    write_json(artifact_version_file(project["id"], stage_key, version), entry)
    invalidate_downstream_artifacts(project, stage_key, reason=f"{stage_key}:v{version}")
    return entry


def invalidate_downstream_artifacts(project: dict[str, Any], stage_key: str, reason: str) -> None:
    start_index = STAGE_KEYS.index(stage_key) + 1
    for downstream_key in STAGE_KEYS[start_index:]:
        artifact = project["artifacts"][downstream_key]
        if artifact["currentVersion"] > 0:
            artifact["status"] = "needs_revalidation"
            artifact["confirmationRequired"] = True
            artifact["reviewState"] = "stale_due_to_upstream_change"
            artifact["invalidatedBy"] = reason
            artifact["locked"] = False
            append_audit_event(
                project["id"],
                "artifact_invalidated",
                {"stageKey": downstream_key, "reason": reason},
            )


def confirm_artifact(project: dict[str, Any], stage_key: str, reviewer: str, note: str) -> dict[str, Any]:
    artifact = project["artifacts"][stage_key]
    if artifact["currentVersion"] <= 0:
        raise ConflictError(
            "该阶段尚未生成内容，无法确认。",
            code="ARTIFACT_NOT_READY_FOR_CONFIRMATION",
            details={"stageKey": stage_key},
        )
    artifact["confirmedVersion"] = artifact["currentVersion"]
    artifact["status"] = "confirmed"
    artifact["confirmationRequired"] = False
    artifact["locked"] = True
    artifact["reviewState"] = "approved"
    artifact["invalidatedBy"] = None
    record = {
        "id": f"cnf-{uuid4().hex[:10]}",
        "stageKey": stage_key,
        "stageLabel": STAGE_MAP[stage_key]["label"],
        "version": artifact["currentVersion"],
        "reviewer": reviewer or "本地创作者",
        "note": note,
        "createdAt": now_iso(),
    }
    project["confirmationRecords"].insert(0, record)
    append_audit_event(project["id"], "artifact_confirmed", record)
    return record


def normalize_editor_content(raw_content: Any) -> Any:
    if isinstance(raw_content, (dict, list)):
        return raw_content
    text = str(raw_content or "")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"text": text}


def ensure_stage_mutable(project: dict[str, Any], stage_key: str, *, force_unlock: bool = False, reason: str = "") -> None:
    artifact = project["artifacts"][stage_key]
    if artifact.get("locked") and not force_unlock:
        raise ConflictError(
            "该阶段已确认并冻结；若需修改，请显式解冻后再编辑或重生。",
            code="ARTIFACT_LOCKED",
            details={"stageKey": stage_key},
        )
    if artifact.get("locked") and force_unlock:
        artifact["locked"] = False
        artifact["confirmationRequired"] = True
        artifact["status"] = "edited"
        artifact["reviewState"] = "pending_review"
        append_audit_event(project["id"], "artifact_unlocked", {"stageKey": stage_key, "reason": reason})


def add_asset(project: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name") or "").strip()
    kind = str(payload.get("kind") or "").strip()
    if not name:
        raise ValidationError("素材名称不能为空。", code="ASSET_NAME_REQUIRED")
    if not kind:
        raise ValidationError("素材类型不能为空。", code="ASSET_KIND_REQUIRED")
    asset = {
        "id": f"asset-{uuid4().hex[:10]}",
        "name": name,
        "kind": kind,
        "path": str(payload.get("path") or "").strip(),
        "notes": str(payload.get("notes") or "").strip(),
        "createdAt": now_iso(),
    }
    project["assets"].insert(0, asset)
    append_audit_event(project["id"], "asset_registered", asset)
    return asset


def all_artifacts_confirmed(project: dict[str, Any]) -> bool:
    for stage_key in STAGE_KEYS:
        artifact = project["artifacts"][stage_key]
        if artifact["currentVersion"] <= 0:
            return False
        if artifact["confirmedVersion"] != artifact["currentVersion"]:
            return False
    return True


def refresh_project_status(project: dict[str, Any]) -> dict[str, Any]:
    ensure_project_schema(project)
    generated_count = sum(1 for key in STAGE_KEYS if project["artifacts"][key]["currentVersion"] > 0)
    if project["publishing"]["latestHandoffVersion"]:
        project["status"] = "manual_publish_handoff_ready"
        project["workflow"]["state"] = "manual_publish_handoff_ready"
        project["workflow"]["pausedForConfirmation"] = False
    elif project["publishing"]["latestPackageVersion"]:
        project["status"] = "publish_package_ready"
        project["workflow"]["state"] = "publish_package_ready"
        project["workflow"]["pausedForConfirmation"] = False
    elif project["mediaOutputs"]:
        project["status"] = "media_ready"
        project["workflow"]["state"] = "media_ready"
        project["workflow"]["pausedForConfirmation"] = False
    elif all_artifacts_confirmed(project):
        project["status"] = "ready_for_export"
        project["workflow"]["state"] = "ready_for_export"
        project["workflow"]["pausedForConfirmation"] = False
    elif generated_count > 0:
        project["status"] = "awaiting_confirmation"
        project["workflow"]["state"] = "awaiting_confirmation"
        project["workflow"]["pausedForConfirmation"] = True
    else:
        project["status"] = "draft"
        project["workflow"]["state"] = "idle"
        project["workflow"]["pausedForConfirmation"] = False
    return project


def summarize_project(project: dict[str, Any]) -> dict[str, Any]:
    ensure_project_schema(project)
    return {
        "id": project["id"],
        "name": project["name"],
        "status": project["status"],
        "updatedAt": project["updatedAt"],
        "createdAt": project["createdAt"],
        "brief": project["brief"],
        "workflow": {
            "state": project["workflow"]["state"],
            "pausedForConfirmation": project["workflow"]["pausedForConfirmation"],
            "runCount": project["workflow"]["runCount"],
            "lastRunId": project["workflow"]["lastRunId"],
        },
        "publishing": project["publishing"],
    }


def record_workflow_run(project_id: str, workflow_run: dict[str, Any]) -> None:
    write_json(workflow_run_file(project_id, workflow_run["id"]), workflow_run)


def create_export_package(project: dict[str, Any]) -> dict[str, Any]:
    if not all_artifacts_confirmed(project):
        raise ConflictError(
            "必须先逐项人工确认所有阶段产物，才能准备发布素材包。",
            code="ARTIFACT_CONFIRMATION_REQUIRED",
        )
    version = len(project["exportPackages"]) + 1
    script = project["artifacts"]["script"]["currentContent"] or {}
    cover = project["artifacts"]["cover"]["currentContent"] or {}
    publish_package = project["artifacts"]["publish_package"]["currentContent"] or {}
    export_payload = {
        "version": version,
        "createdAt": now_iso(),
        "platform": "douyin",
        "manualPublishOnly": True,
        "rule": MANUAL_PUBLISH_RULE,
        "projectId": project["id"],
        "projectName": project["name"],
        "headline": cover.get("headline") or script.get("title") or project["name"],
        "description": publish_package.get("description") or "",
        "hashtags": publish_package.get("hashtags") or [],
        "manualChecklist": publish_package.get("manualChecklist") or [],
        "assets": project["assets"],
        "mediaOutput": project["mediaOutputs"][0] if project["mediaOutputs"] else None,
        "confirmedArtifacts": [
            {
                "stageKey": key,
                "label": project["artifacts"][key]["label"],
                "version": project["artifacts"][key]["currentVersion"],
            }
            for key in STAGE_KEYS
        ],
    }
    project["exportPackages"].insert(0, export_payload)
    project["publishing"]["status"] = "package_ready"
    project["publishing"]["latestPackageVersion"] = version
    write_json(export_file(project["id"], version), export_payload)
    append_audit_event(project["id"], "export_package_prepared", export_payload)
    return export_payload


def create_media_output(project: dict[str, Any], payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    if not all_artifacts_confirmed(project):
        raise ConflictError(
            "必须先人工确认所有阶段产物，才能执行成片导出。",
            code="MEDIA_EXPORT_CONFIRMATION_REQUIRED",
        )
    version = len(project["mediaOutputs"]) + 1
    exports_dir = project_dir(project["id"]) / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = exports_dir / f"media-manifest-v{version}.json"
    subtitles_path = exports_dir / f"subtitles-v{version}.srt"
    package_path = exports_dir / f"final-cut-v{version}.txt"
    bundle_index_path = exports_dir / f"export-bundle-v{version}.html"
    assets_manifest_path = exports_dir / f"assets-manifest-v{version}.json"
    evidence_path = exports_dir / f"export-evidence-v{version}.json"
    readme_path = exports_dir / f"README-export-v{version}.md"
    subtitle_items = (project["artifacts"]["subtitles"].get("currentContent") or {}).get("items") or []
    subtitles_text = "\n\n".join(
        [f"{index}\n{item.get('start', '00:00')} --> {item.get('end', '00:01')}\n{item.get('text', '')}" for index, item in enumerate(subtitle_items, start=1)]
    )
    subtitles_path.write_text(subtitles_text or "1\n00:00 --> 00:01\n字幕占位\n", encoding="utf-8")
    manifest = {
        "version": version,
        "generatedAt": now_iso(),
        "projectId": project["id"],
        "projectName": project["name"],
        "assets": project["assets"],
        "artifactVersions": {
            key: project["artifacts"][key]["currentVersion"] for key in ["script", "storyboard", "voiceover", "subtitles", "cover", "publish_package"]
        },
        "subtitleFile": str(subtitles_path),
        "bundleIndexFile": str(bundle_index_path),
    }
    write_json(manifest_path, manifest)
    write_json(assets_manifest_path, {"assets": project["assets"], "generatedAt": now_iso(), "projectId": project["id"]})
    write_json(
        evidence_path,
        {
            "projectId": project["id"],
            "version": version,
            "generatedAt": now_iso(),
            "evidence": {
                "manifestPath": str(manifest_path),
                "subtitlePath": str(subtitles_path),
                "bundleIndexPath": str(bundle_index_path),
                "assetsManifestPath": str(assets_manifest_path),
                "finalCutPath": str(package_path),
            },
        },
    )
    package_path.write_text(
        "\n".join(
            [
                f"Project: {project['name']}",
                f"Version: {version}",
                "This is a manifest-driven local export placeholder.",
                f"Subtitle file: {subtitles_path}",
                f"Manifest file: {manifest_path}",
            ]
        ),
        encoding="utf-8",
    )
    readme_path.write_text(
        "\n".join(
            [
                f"# {project['name']} 导出演示说明 V{version}",
                "",
                "本目录用于演示本地 AI 视频制作导出闭环。",
                "",
                f"- 成片占位文件: {package_path}",
                f"- 媒体 Manifest: {manifest_path}",
                f"- 素材 Manifest: {assets_manifest_path}",
                f"- 字幕文件: {subtitles_path}",
                f"- 导出清单页: {bundle_index_path}",
                f"- 证据文件: {evidence_path}",
            ]
        ),
        encoding="utf-8",
    )
    bundle_index_path.write_text(
        f"""<!doctype html>
<html lang=\"zh-CN\"><head><meta charset=\"utf-8\" /><title>{html.escape(project['name'])} 导出清单</title></head>
<body>
<h1>{html.escape(project['name'])} 导出清单 V{version}</h1>
<p>此页面用于演示媒体导出结果与证据组织。当前仍为本地 manifest 驱动导出，不包含自动发布。</p>
<ul>
  <li>成片占位文件：{html.escape(str(package_path))}</li>
  <li>媒体 Manifest：{html.escape(str(manifest_path))}</li>
  <li>素材清单：{html.escape(str(assets_manifest_path))}</li>
  <li>字幕文件：{html.escape(str(subtitles_path))}</li>
  <li>导出说明：{html.escape(str(readme_path))}</li>
  <li>导出证据：{html.escape(str(evidence_path))}</li>
</ul>
</body></html>""",
        encoding="utf-8",
    )
    output = {
        "version": version,
        "createdAt": now_iso(),
        "status": "manifest_ready",
        "pipeline": "local_manifest_media_pipeline",
        "outputPath": str(package_path),
        "manifestPath": str(manifest_path),
        "assetsManifestPath": str(assets_manifest_path),
        "evidencePath": str(evidence_path),
        "readmePath": str(readme_path),
        "subtitlePath": str(subtitles_path),
        "bundleIndexPath": str(bundle_index_path),
        "timeline": {
            "scriptVersion": project["artifacts"]["script"]["currentVersion"],
            "storyboardVersion": project["artifacts"]["storyboard"]["currentVersion"],
            "voiceoverVersion": project["artifacts"]["voiceover"]["currentVersion"],
            "subtitleVersion": project["artifacts"]["subtitles"]["currentVersion"],
            "coverVersion": project["artifacts"]["cover"]["currentVersion"],
        },
        "assemblyNotes": str(payload.get("notes") or "使用 stub 媒体装配流水线生成可扩展的成片导出记录。"),
        "manualReviewRequired": True,
    }
    project["mediaOutputs"].insert(0, output)
    project["publishing"]["latestMediaOutputVersion"] = version
    write_json(media_export_file(project["id"], version), output)
    append_audit_event(project["id"], "media_output_created", output)
    return output


def create_manual_publish_handoff(project: dict[str, Any], payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    if not project["exportPackages"]:
        raise ConflictError(
            "必须先准备发布素材包，才能进行人工发布交接。",
            code="PUBLISH_PACKAGE_REQUIRED",
        )
    if not project["mediaOutputs"]:
        raise ConflictError(
            "必须先生成成片导出记录，才能进行人工发布交接。",
            code="MEDIA_OUTPUT_REQUIRED",
        )
    version = len(project["publishing"]["handoffRecords"]) + 1
    latest_package = project["exportPackages"][0]
    latest_media = project["mediaOutputs"][0]
    handoff = {
        "version": version,
        "id": f"handoff-{uuid4().hex[:10]}",
        "createdAt": now_iso(),
        "status": "ready_for_manual_publish",
        "platform": "douyin",
        "manualPublishOnly": True,
        "confirmedBy": str(payload.get("reviewer") or "本地创作者"),
        "note": str(payload.get("note") or "已完成人工确认发布交接，后续需在平台侧手动发布。"),
        "nextAction": "请创作者使用本地导出成片与发布素材，在抖音客户端/创作工具中手动完成发布。",
        "packageVersion": latest_package["version"],
        "mediaOutputVersion": latest_media["version"],
        "checklist": latest_package.get("manualChecklist") or [],
        "launchMode": "manual_only",
        "autoPublishImplemented": False,
        "launchEvidence": [],
    }
    checklist_html_path = handoff_html_file(project["id"], version)
    checklist_html_path.write_text(render_publish_handoff_html(project, handoff, latest_package, latest_media), encoding="utf-8")
    handoff["checklistHtmlPath"] = str(checklist_html_path)
    handoff["fallbackActions"] = {
        "openExportDir": str(project_dir(project["id"]) / "exports"),
        "openChecklistHtml": str(checklist_html_path),
        "copyPublishText": True,
    }
    project["publishing"]["handoffRecords"].insert(0, handoff)
    project["publishing"]["status"] = "handoff_recorded"
    project["publishing"]["latestHandoffVersion"] = version
    write_json(handoff_file(project["id"], version), handoff)
    append_audit_event(project["id"], "manual_publish_handoff_recorded", handoff)
    return handoff


def record_launch_evidence(project: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    if not project["publishing"]["handoffRecords"]:
        raise ConflictError("必须先记录人工发布交接，才能记录调起证据。", code="HANDOFF_REQUIRED")
    evidence = {
        "id": f"launch-{uuid4().hex[:10]}",
        "createdAt": now_iso(),
        "action": str(payload.get("action") or "open_handoff"),
        "targetPath": str(payload.get("targetPath") or ""),
        "status": str(payload.get("status") or "recorded"),
        "note": str(payload.get("note") or ""),
    }
    project["publishing"]["handoffRecords"][0].setdefault("launchEvidence", []).insert(0, evidence)
    append_audit_event(project["id"], "manual_publish_launch_evidence", evidence)
    return evidence


def record_runtime_bridge_run(project: dict[str, Any], run_payload: dict[str, Any]) -> dict[str, Any]:
    project.setdefault("runtimeBridgeRuns", [])
    project["runtimeBridgeRuns"].insert(0, run_payload)
    append_audit_event(project["id"], "runtime_bridge_run_recorded", run_payload)
    return run_payload
