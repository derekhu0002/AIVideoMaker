from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request


PORT = os.environ.get("TEST_APP_PORT", "8765")
BASE_URL = f"http://127.0.0.1:{PORT}"


def request(path: str, payload: dict | None = None):
    data = None
    headers = {}
    method = "GET"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def main() -> int:
    env = os.environ.copy()
    env["APP_PORT"] = PORT
    proc = subprocess.Popen([sys.executable, "run.py"], env=env)
    try:
        time.sleep(1.2)

        status, payload = request("/api/projects/not-real-project")
        assert status == 404, (status, payload)
        assert payload["ok"] is False
        assert payload["error"]["code"] == "PROJECT_NOT_FOUND"

        status, payload = request(
            "/api/projects",
            {
                "name": "Regression Project",
                "topic": "错误码回归",
                "audience": "开发者",
                "style": "严谨",
                "durationSeconds": 60,
            },
        )
        assert status == 201, (status, payload)
        project_id = payload["data"]["project"]["id"]

        status, payload = request(f"/api/projects/{project_id}/export-package", {})
        assert status == 409, (status, payload)
        assert payload["error"]["code"] == "ARTIFACT_CONFIRMATION_REQUIRED"

        status, payload = request(f"/api/projects/{project_id}/media-export", {"notes": "before confirm"})
        assert status == 409, (status, payload)
        assert payload["error"]["code"] == "MEDIA_EXPORT_CONFIRMATION_REQUIRED"

        status, payload = request(f"/api/projects/{project_id}/generate", {"reason": "regression"})
        assert status == 200, (status, payload)

        for stage in ["script", "storyboard", "voiceover", "subtitles", "cover", "publish_package"]:
            status, payload = request(
                f"/api/projects/{project_id}/artifacts/{stage}/confirm",
                {"reviewer": "test", "note": "ok"},
            )
            assert status == 200, (stage, status, payload)

        status, payload = request(f"/api/projects/{project_id}/media-export", {"notes": "after confirm"})
        assert status == 200, (status, payload)

        status, payload = request(f"/api/projects/{project_id}/export-package", {})
        assert status == 200, (status, payload)

        status, payload = request(
            f"/api/projects/{project_id}/manual-publish-handoff",
            {"reviewer": "test", "note": "manual only"},
        )
        assert status == 200, (status, payload)
        assert payload["data"]["handoff"]["autoPublishImplemented"] is False

        print(json.dumps({"status": "passed", "projectId": project_id}, ensure_ascii=False))
        return 0
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
