from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
PROJECTS_DIR = DATA_DIR / "projects"
WEB_DIR = BASE_DIR / "web"

STAGE_DEFINITIONS = [
    {"key": "script", "label": "脚本", "agent": "ScriptStrategist"},
    {"key": "storyboard", "label": "分镜", "agent": "StoryboardDirector"},
    {"key": "voiceover", "label": "配音文案", "agent": "VoiceoverProducer"},
    {"key": "subtitles", "label": "字幕", "agent": "SubtitleEditor"},
    {"key": "cover", "label": "封面文案", "agent": "CoverDesigner"},
    {"key": "publish_package", "label": "标题简介标签建议", "agent": "PublishingAssistant"},
]

STAGE_KEYS = [item["key"] for item in STAGE_DEFINITIONS]
STAGE_MAP = {item["key"]: item for item in STAGE_DEFINITIONS}

MANUAL_PUBLISH_RULE = "抖音 MVP 仅允许生成人工确认后的发布素材，不允许无确认自动直发。"
