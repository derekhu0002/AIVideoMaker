from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request


PORT = os.environ.get("TEST_APP_PORT", "8766")
BASE_URL = f"http://127.0.0.1:{PORT}"


def request(path: str, payload: dict | None = None, timeout: int = 120):
    data = None
    headers = {}
    method = "GET"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


def main() -> int:
    root_runtime = "./.opencode/runtime/project-state.json"
    root_temp = "./.opencode/temp/opencode-graph-updates.jsonl"
    root_runtime_before = os.path.getmtime(root_runtime) if os.path.exists(root_runtime) else None
    root_temp_before = os.path.getmtime(root_temp) if os.path.exists(root_temp) else None

    env = os.environ.copy()
    env["APP_PORT"] = PORT
    proc = subprocess.Popen([sys.executable, "run.py"], env=env)
    try:
        time.sleep(1.5)
        status, payload = request(
            "/api/projects",
            {
                "name": "Sandbox Bridge Project",
                "topic": "多 Agent 沙箱验证",
                "audience": "开发者",
                "style": "结构化",
                "durationSeconds": 30,
            },
        )
        assert status == 201, (status, payload)
        project_id = payload["data"]["project"]["id"]

        status, payload = request(
            f"/api/projects/{project_id}/runtime-bridge-run",
            {"prompt": "Validate isolated runtime bridge."},
            timeout=240,
        )
        assert status == 200, (status, payload)
        bridge = payload["data"]["bridgeRun"]
        assert bridge["status"] == "passed", bridge
        assert os.path.exists(bridge["manifestPath"])
        assert os.path.exists(bridge["stdoutPath"])
        assert os.path.exists(bridge["stderrPath"])
        assert bridge["result"]["status"] in {"ok", "validated"}, bridge["result"]

        manifest = json.load(open(bridge["manifestPath"], encoding="utf-8"))
        assert manifest["runtimeIsolation"]["mainWorkspaceRuntimeTouched"] is False
        assert "sandbox/opencode-runtime" in manifest["sandboxDir"]

        root_runtime_after = os.path.getmtime(root_runtime) if os.path.exists(root_runtime) else None
        root_temp_after = os.path.getmtime(root_temp) if os.path.exists(root_temp) else None
        assert root_runtime_before == root_runtime_after, (root_runtime_before, root_runtime_after)
        assert root_temp_before == root_temp_after, (root_temp_before, root_temp_after)

        print(json.dumps({"status": "passed", "projectId": project_id, "bridgeStatus": bridge["status"]}, ensure_ascii=False))
        return 0
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
