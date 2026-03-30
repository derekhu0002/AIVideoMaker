from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request


PORT = os.environ.get("TEST_APP_PORT", "8768")
BASE_URL = f"http://127.0.0.1:{PORT}"


def request(path: str, payload: dict | None = None, timeout: int = 240):
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
    env = os.environ.copy()
    env["APP_PORT"] = PORT
    proc = subprocess.Popen([sys.executable, "run.py"], env=env)
    try:
        time.sleep(1.5)
        status, payload = request(
            "/api/projects",
            {
                "name": "Demo Artifacts Project",
                "topic": "演示证据增强",
                "audience": "QA 与 Audit",
                "style": "结构化",
                "durationSeconds": 30,
            },
        )
        assert status == 201
        project_id = payload["data"]["project"]["id"]

        status, payload = request(f"/api/projects/{project_id}/generate-with-bridge", {"prompt": "Prepare demoable project guidance."})
        assert status == 200

        for stage in ["script", "storyboard", "voiceover", "subtitles", "cover", "publish_package"]:
            status, payload = request(f"/api/projects/{project_id}/artifacts/{stage}/confirm", {"reviewer": "qa", "note": "ok"})
            assert status == 200

        status, payload = request(f"/api/projects/{project_id}/media-export", {"notes": "artifact evidence"})
        assert status == 200
        media = payload["data"]["mediaOutput"]
        assert os.path.exists(media["evidencePath"])
        assert os.path.exists(media["readmePath"])

        status, payload = request(f"/api/projects/{project_id}/export-package", {})
        assert status == 200
        status, payload = request(f"/api/projects/{project_id}/manual-publish-handoff", {"reviewer": "qa", "note": "handoff"})
        assert status == 200
        handoff = payload["data"]["handoff"]
        assert handoff["fallbackActions"]["copyPublishText"] is True
        assert os.path.exists(handoff["checklistHtmlPath"])

        base = os.path.join("data", "projects", project_id, "runtime-bridge")
        assert os.path.exists(os.path.join(base, "acceptance-checklist.md"))
        assert os.path.exists(os.path.join(base, "acceptance-sample.json"))
        assert os.path.exists(os.path.join(base, "demo-walkthrough.md"))

        print(json.dumps({"status": "passed", "projectId": project_id}, ensure_ascii=False))
        return 0
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
