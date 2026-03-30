from __future__ import annotations

from pathlib import Path


def main() -> int:
    source = Path("web/app.js").read_text(encoding="utf-8")

    assert "Array.isArray(data?.projects) ? data.projects : []" in source
    assert "const formElement = event.currentTarget;" in source
    assert "formElement?.reset();" in source
    assert "state.selectedProject = null;" in source

    print('{"status": "passed"}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
