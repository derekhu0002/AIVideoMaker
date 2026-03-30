from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request


PORT = os.environ.get("TEST_APP_PORT", "8767")
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
                "name": "Demo Flow Project",
                "topic": "演示版收口",
                "audience": "创作者",
                "style": "清晰",
                "durationSeconds": 30,
            },
        )
        assert status == 201, (status, payload)
        project_id = payload["data"]["project"]["id"]

        status, payload = request(f"/api/projects/{project_id}/generate-with-bridge", {"prompt": "Generate demoable guidance."})
        assert status == 200, (status, payload)
        project = payload["data"]["project"]
        assert project["artifacts"]["script"]["currentVersion"] >= 1
        assert payload["data"]["bridgeRun"]["status"] in {"passed", "failed"}

        for stage in ["script", "storyboard", "voiceover", "subtitles", "cover", "publish_package"]:
            status, payload = request(f"/api/projects/{project_id}/artifacts/{stage}/confirm", {"reviewer": "demo", "note": "ok"})
            assert status == 200, (stage, status, payload)

        status, payload = request(f"/api/projects/{project_id}/media-export", {"notes": "demo export"})
        assert status == 200, (status, payload)
        media = payload["data"]["mediaOutput"]
        assert os.path.exists(media["manifestPath"])
        assert os.path.exists(media["bundleIndexPath"])

        status, payload = request(f"/api/projects/{project_id}/export-package", {})
        assert status == 200, (status, payload)

        status, payload = request(f"/api/projects/{project_id}/manual-publish-handoff", {"reviewer": "demo", "note": "handoff"})
        assert status == 200, (status, payload)
        handoff = payload["data"]["handoff"]
        assert os.path.exists(handoff["checklistHtmlPath"])
        checklist = payload["data"]["acceptanceChecklist"]
        assert os.path.exists(checklist["path"])

        print(json.dumps({"status": "passed", "projectId": project_id}, ensure_ascii=False))
        return 0
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
