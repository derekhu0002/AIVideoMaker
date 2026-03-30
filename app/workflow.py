from __future__ import annotations

from typing import Any
from uuid import uuid4

from .constants import MANUAL_PUBLISH_RULE, STAGE_DEFINITIONS, STAGE_KEYS, STAGE_MAP
from .storage import append_audit_event, now_iso, record_artifact_version, record_workflow_run


def _brief(project: dict[str, Any]) -> dict[str, Any]:
    return project.get("brief", {})


def _current(project: dict[str, Any], stage_key: str) -> Any:
    return project["artifacts"][stage_key].get("currentContent") or {}


def _build_script(project: dict[str, Any], revision: int, reason: str) -> dict[str, Any]:
    brief = _brief(project)
    topic = brief.get("topic") or project["name"]
    audience = brief.get("audience") or "泛创作者"
    style = brief.get("style") or "清晰、有说服力"
    duration = brief.get("durationSeconds") or 30
    return {
        "title": f"{topic}：{audience} 可直接执行的短视频方案 V{revision}",
        "hook": f"如果你也想用 {duration} 秒讲清楚 {topic}，这版脚本更适合 {audience}。",
        "beats": [
            f"开场 3 秒：用反差问题抓住 {audience} 注意力。",
            f"主体 1：用 {style} 风格交代核心观点与价值。",
            f"主体 2：给出 2-3 个可执行动作，降低理解门槛。",
            "结尾 CTA：引导评论/收藏/私信领取延展资料。",
        ],
        "notes": f"生成原因：{reason or '首次生成'}。",
    }


def _build_storyboard(project: dict[str, Any], revision: int, reason: str) -> dict[str, Any]:
    script = _current(project, "script")
    beats = script.get("beats") or []
    scenes = []
    for index, beat in enumerate(beats, start=1):
        scenes.append(
            {
                "scene": index,
                "durationSeconds": 4 if index == 1 else 6,
                "visual": f"围绕“{beat}”设计纵向短视频画面与字幕重点。",
                "camera": "近景 + 动态字幕 + 轻微推拉镜头",
            }
        )
    return {
        "summary": script.get("title") or f"分镜 V{revision}",
        "scenes": scenes,
        "notes": f"与脚本版本联动；原因：{reason or '首次生成'}。",
    }


def _build_voiceover(project: dict[str, Any], revision: int, reason: str) -> dict[str, Any]:
    script = _current(project, "script")
    beats = script.get("beats") or []
    return {
        "tone": "自然、可信、节奏紧凑",
        "lines": [f"第 {index} 段配音：{beat}" for index, beat in enumerate(beats, start=1)],
        "recordingHint": f"建议语速略快，修订版 V{revision}。",
        "notes": f"生成原因：{reason or '首次生成'}。",
    }


def _build_subtitles(project: dict[str, Any], revision: int, reason: str) -> dict[str, Any]:
    voiceover = _current(project, "voiceover")
    items = []
    for index, line in enumerate(voiceover.get("lines") or [], start=1):
        items.append(
            {
                "index": index,
                "start": f"00:{(index - 1) * 4:02d}",
                "end": f"00:{index * 4:02d}",
                "text": line,
            }
        )
    return {
        "style": "高对比白字 + 关键词高亮",
        "items": items,
        "notes": f"生成原因：{reason or '首次生成'}。",
    }


def _build_cover(project: dict[str, Any], revision: int, reason: str) -> dict[str, Any]:
    script = _current(project, "script")
    topic = _brief(project).get("topic") or project["name"]
    return {
        "headline": script.get("title") or f"{topic} 短视频封面 V{revision}",
        "subheadline": "人工确认后再用于外部平台发布",
        "visualDirection": "高对比大字 + 单一主卖点 + 人像/主体居中",
        "notes": f"生成原因：{reason or '首次生成'}。",
    }


def _build_publish_package(project: dict[str, Any], revision: int, reason: str) -> dict[str, Any]:
    brief = _brief(project)
    topic = brief.get("topic") or project["name"]
    audience = brief.get("audience") or "目标用户"
    return {
        "title": f"{topic}，给 {audience} 的高转化短视频提案 V{revision}",
        "description": f"围绕 {topic} 生成本地可追溯的发布素材包，发布前必须由人工确认。",
        "hashtags": ["#抖音MVP", f"#{topic}", "#人工确认发布", "#本地工作台"],
        "manualChecklist": [
            "确认脚本、分镜、配音、字幕与封面版本一致",
            "确认发布标题、简介、标签符合平台预期",
            "确认不启用任何无确认自动直发能力",
            MANUAL_PUBLISH_RULE,
        ],
        "notes": f"生成原因：{reason or '首次生成'}。",
    }


BUILDERS = {
    "script": _build_script,
    "storyboard": _build_storyboard,
    "voiceover": _build_voiceover,
    "subtitles": _build_subtitles,
    "cover": _build_cover,
    "publish_package": _build_publish_package,
}


def run_generation(project: dict[str, Any], target_stage: str | None = None, reason: str = "") -> tuple[dict[str, Any], dict[str, Any]]:
    run_id = f"run-{uuid4().hex[:10]}"
    started_at = now_iso()
    project["workflow"]["state"] = "running"
    project["workflow"]["pausedForConfirmation"] = False
    project["workflow"]["currentStage"] = target_stage or STAGE_KEYS[0]
    project["workflow"]["runCount"] += 1
    project["workflow"]["lastRunId"] = run_id
    stage_index = STAGE_KEYS.index(target_stage) if target_stage else 0
    selected_stages = STAGE_KEYS[stage_index:]
    steps = []

    for stage_key in selected_stages:
        artifact = project["artifacts"][stage_key]
        revision = int(artifact["currentVersion"]) + 1
        stage_meta = STAGE_MAP[stage_key]
        content = BUILDERS[stage_key](project, revision, reason)
        version_entry = record_artifact_version(
            project,
            stage_key,
            content,
            source="agent_generated",
            actor=stage_meta["agent"],
            note=reason or "workflow generation",
            agent_run_id=run_id,
        )
        step = {
            "stageKey": stage_key,
            "stageLabel": stage_meta["label"],
            "agent": stage_meta["agent"],
            "attempts": 1,
            "status": "completed",
            "retryAvailable": True,
            "manualConfirmationRequired": True,
            "producedVersion": version_entry["version"],
            "timestamp": version_entry["createdAt"],
        }
        steps.append(step)
        append_audit_event(
            project["id"],
            "artifact_generated",
            {
                "runId": run_id,
                "stageKey": stage_key,
                "version": version_entry["version"],
                "agent": stage_meta["agent"],
                "reason": reason or "workflow generation",
            },
        )

    finished_at = now_iso()
    workflow_run = {
        "id": run_id,
        "startedAt": started_at,
        "finishedAt": finished_at,
        "trigger": "regenerate" if target_stage else "initial_generate",
        "reason": reason,
        "state": "awaiting_manual_confirmation",
        "pausedForConfirmation": True,
        "manualPublishOnly": True,
        "steps": steps,
        "contextSummary": {
            "projectId": project["id"],
            "projectName": project["name"],
            "brief": project["brief"],
            "agentTeam": [item["agent"] for item in STAGE_DEFINITIONS],
        },
    }
    project["workflow"]["history"].insert(0, workflow_run)
    project["workflow"]["currentStage"] = None
    record_workflow_run(project["id"], workflow_run)
    return project, workflow_run
