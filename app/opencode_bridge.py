from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any
from uuid import uuid4

from .constants import BASE_DIR
from .storage import (
    append_system_event,
    now_iso,
    record_runtime_bridge_run,
    runtime_bridge_run_dir,
    write_json,
)


SANDBOX_DIR = BASE_DIR / "sandbox" / "opencode-runtime"
def sandbox_main_runtime_dir() -> Path:
    return SANDBOX_DIR / ".opencode" / "runtime"


def sandbox_main_temp_dir() -> Path:
    return SANDBOX_DIR / ".opencode" / "temp"


def ensure_sandbox_dirs() -> None:
    sandbox_main_runtime_dir().mkdir(parents=True, exist_ok=True)
    sandbox_main_temp_dir().mkdir(parents=True, exist_ok=True)
    (SANDBOX_DIR / "runs").mkdir(parents=True, exist_ok=True)


def prepare_run_worktree(run_id: str) -> Path:
    ensure_sandbox_dirs()
    template_files = [SANDBOX_DIR / "AGENTS.md", SANDBOX_DIR / ".opencode"]
    run_worktree = SANDBOX_DIR / "runs" / run_id
    if run_worktree.exists():
        shutil.rmtree(run_worktree)
    run_worktree.mkdir(parents=True, exist_ok=True)
    for item in template_files:
        target = run_worktree / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)
    (run_worktree / ".opencode" / "runtime").mkdir(parents=True, exist_ok=True)
    (run_worktree / ".opencode" / "temp").mkdir(parents=True, exist_ok=True)
    return run_worktree


def create_project_snapshot(project: dict[str, Any]) -> dict[str, Any]:
    return {
        "projectId": project["id"],
        "projectName": project["name"],
        "status": project["status"],
        "brief": project["brief"],
        "artifacts": {
            key: {
                "version": project["artifacts"][key]["currentVersion"],
                "status": project["artifacts"][key]["status"],
                "content": project["artifacts"][key]["currentContent"],
            }
            for key in project["artifacts"]
        },
        "publishing": project.get("publishing", {}),
    }


def run_opencode_bridge(project: dict[str, Any], prompt: str | None = None) -> dict[str, Any]:
    ensure_sandbox_dirs()
    run_id = f"bridge-{uuid4().hex[:10]}"
    run_dir = runtime_bridge_run_dir(project["id"], run_id)
    run_dir.mkdir(parents=True, exist_ok=True)
    sandbox_run_dir = prepare_run_worktree(run_id)

    snapshot = create_project_snapshot(project)
    snapshot_path = run_dir / "project-snapshot.json"
    stdout_path = run_dir / "stdout.log"
    stderr_path = run_dir / "stderr.log"
    result_path = run_dir / "result.json"
    manifest_path = run_dir / "manifest.json"

    write_json(snapshot_path, snapshot)

    user_prompt = prompt or (
        "Analyze this local AI video project snapshot in the isolated sandbox. "
        "Delegate once to SandboxWorker and return final JSON only. "
        f"Snapshot file: {snapshot_path}"
    )

    snapshot_message = (
        f"Project snapshot JSON:\n{json.dumps(snapshot, ensure_ascii=False)}\n\n"
        f"User request:\n{user_prompt}"
    )

    command = [
        "opencode",
        "run",
        snapshot_message,
        "--agent",
        "SandboxOrchestrator",
        "--model",
        "github-copilot/gpt-5.4",
        "--format",
        "json",
        "--dir",
        str(sandbox_run_dir),
    ]

    env = os.environ.copy()

    completed = subprocess.run(command, cwd=sandbox_run_dir, env=env, capture_output=True, text=True, timeout=120)
    stdout_path.write_text(completed.stdout or "", encoding="utf-8")
    stderr_path.write_text(completed.stderr or "", encoding="utf-8")

    parsed_result: dict[str, Any] | None = None
    raw_lines = [line for line in (completed.stdout or "").splitlines() if line.strip()]
    text_event_payload: dict[str, Any] | None = None
    for line in reversed(raw_lines):
        try:
            candidate = json.loads(line)
            if isinstance(candidate, dict):
                if candidate.get("type") == "text" and isinstance(candidate.get("part"), dict):
                    text_block = candidate["part"].get("text")
                    if isinstance(text_block, str):
                        try:
                            text_event_payload = json.loads(text_block)
                            break
                        except json.JSONDecodeError:
                            parsed_result = candidate
                            break
                parsed_result = candidate
                if candidate.get("type") == "error":
                    break
        except json.JSONDecodeError:
            continue

    if text_event_payload is not None:
        parsed_result = text_event_payload

    if parsed_result is None:
        parsed_result = {
            "status": "unknown",
            "summary": "No structured JSON line parsed from opencode stdout.",
            "rawTail": raw_lines[-5:],
        }

    if isinstance(parsed_result, dict) and parsed_result.get("type") != "error":
        raw_status = str(parsed_result.get("status") or "").strip().lower()
        if raw_status in {"ok", "validated"}:
            parsed_result.setdefault("rawStatus", parsed_result.get("status"))
            parsed_result["status"] = "ok"
            parsed_result["success"] = True

    bridge_status = "passed"
    if completed.returncode != 0:
        bridge_status = "failed"
    elif isinstance(parsed_result, dict) and parsed_result.get("type") == "error":
        bridge_status = "failed"

    write_json(result_path, parsed_result)
    manifest = {
        "id": run_id,
        "createdAt": now_iso(),
        "sandboxDir": str(SANDBOX_DIR),
        "sandboxRunDir": str(sandbox_run_dir),
        "runDir": str(run_dir),
        "snapshotPath": str(snapshot_path),
        "stdoutPath": str(stdout_path),
        "stderrPath": str(stderr_path),
        "resultPath": str(result_path),
        "exitCode": completed.returncode,
        "runtimeIsolation": {
            "sandboxRoot": str(SANDBOX_DIR),
            "sandboxRunDir": str(sandbox_run_dir),
            "home": env.get("HOME"),
            "mainWorkspaceRuntimeTouched": False,
        },
    }
    write_json(manifest_path, manifest)
    bridge_record = {
        "id": run_id,
        "createdAt": manifest["createdAt"],
        "status": bridge_status,
        "manifestPath": str(manifest_path),
        "result": parsed_result,
        "stdoutPath": str(stdout_path),
        "stderrPath": str(stderr_path),
        "exitCode": completed.returncode,
    }
    record_runtime_bridge_run(project, bridge_record)
    append_system_event("info", "opencode_bridge_run", bridge_record)
    return bridge_record
