# AI4PB OpenCode Runtime Bundle

This directory is a self-contained OpenCode runtime bundle for the AI4PB orchestration flow.

It contains:

- agent definitions
- skills used by those agents
- repo-local tools
- a local plugin package that registers those tools with OpenCode
- runtime state and temporary graph artifacts
- the ArchiMate schema used by the shared knowledge graph

The bundle is designed to be copied into another project and used as that project's OpenCode execution layer.

## What This Directory Does

The primary flow is:

1. `ProjectOrchestrator` receives a requirement.
2. `decompose_goal` creates runtime tasks in `.opencode/runtime/project-state.json`.
3. `ProjectOrchestrator` delegates design to `SystemArchitect` using the persisted task IDs.
4. `SystemArchitect` updates the shared knowledge graph and design metadata.
5. `Implementation` executes tasks and records progress.
6. `QualityAssurance` and `Audit` validate the result.
7. `ReleaseAgent` produces the final release output.

The custom tools are registered through the local plugin package in this directory. Without that plugin layer, OpenCode may show tool names in the UI while the repo-local tool implementation never actually runs.

## Directory Layout

Key files and folders:

- `opencode.json`
  - Local OpenCode config stored inside the bundle.
- `package.json`
  - Local package metadata for the `.opencode` runtime package.
- `index.ts`
  - Package root entrypoint.
- `plugins/index.ts`
  - Plugin index that exports the local plugin modules.
- `plugins/ai4pb-runtime-tools.ts`
  - Registers the runtime tools exposed to OpenCode.
- `agents/`
  - Agent prompt files such as `ProjectOrchestrator.md` and `SystemArchitect.md`.
- `skills/`
  - Skill instructions used by agents.
- `tools/`
  - Repo-local OpenCode tools like `decompose_goal`, `query_graph`, and `update_graph_model`.
- `lib/runtimeState.ts`
  - Runtime state read/write helpers.
- `lib/sharedKnowledgeGraph.ts`
  - Canonical shared knowledge graph helpers.
- `runtime/project-state.json`
  - Persisted workflow state.
- `temp/SharedKnowledgeGraph.archimate3.1.json`
  - Canonical shared knowledge graph file.
- `schema/archimate3.1/archimate3.1-exchange-model.schema.json`
  - ArchiMate schema used by the graph layer.

## Agents

The main agent roles are:

- `ProjectOrchestrator`
  - Primary agent. Coordinates the workflow and delegates to specialists.
- `SystemArchitect`
  - Maintains the design model and design decisions.
- `Implementation`
  - Executes coding tasks and records task progress.
- `QualityAssurance`
  - Generates and runs validation checks.
- `Audit`
  - Compares implementation reality against architectural intent.
- `ReleaseAgent`
  - Produces final release outputs.

## Repo-Local Tools

Registered tools:

- `decompose_goal`
  - Breaks a requirement into runtime tasks.
- `read_project_status`
  - Reads persisted runtime status.
- `query_graph`
  - Reads runtime state and architecture graph data.
- `update_graph_model`
  - Updates runtime state and the shared knowledge graph.
- `run_reality_scanner`
  - Collects implementation-side reality signals.
- `generate_test_cases`
  - Produces a QA checklist or test plan.
- `generate_gap_report`
  - Formats architecture-vs-reality gap output.

These tools are not available just because the files exist under `tools/`. They must be exported through the local plugin entrypoints in `plugins/` and the `.opencode` package must be installed.

## Runtime Files

### `runtime/project-state.json`

This file stores persisted workflow state, including:

- active goal
- design summary
- design decisions
- runtime tasks
- issues
- QA and audit status
- release state
- task and issue counters

It is the workflow state source of truth for orchestration decisions.

### `temp/SharedKnowledgeGraph.archimate3.1.json`

This is the canonical shared knowledge graph.

It is intended to conform to the schema at:

- `schema/archimate3.1/archimate3.1-exchange-model.schema.json`

This graph stores the structured architecture model and synchronized runtime-derived concepts.

### `temp/opencode-graph-updates.jsonl`

This file is used as an append-only update log for graph mutations.

## Initialization In Another Project

If you copy this directory into another project, do not copy only selected files. Copy the full `.opencode` directory.

Then initialize it as follows.

### 1. Add a root `opencode.json`

OpenCode project config should live at the target project root, not only inside `.opencode`.

Recommended root `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "github-copilot/gpt-5.4",
  "small_model": "github-copilot/gpt-5.4",
  "default_agent": "ProjectOrchestrator",
  "instructions": [
    "AGENTS.md"
  ],
  "permission": {
    "mcp_*": "ask",
    "skill": {
      "*": "allow"
    }
  }
}
```

Adjust `instructions` if the target repository does not use `AGENTS.md`.

### 2. Install the local `.opencode` package

From the target project root:

```powershell
cd .opencode; npm install
```

This installs `@opencode-ai/plugin` and makes the `.opencode` package loadable.

### 3. Start a fresh OpenCode session

If OpenCode was already running before the bundle was copied or installed, restart the session so it reloads:

- package entrypoints
- plugin index
- runtime tools
- agent definitions
- skills

### 4. Recommended: initialize Git in the target project

A non-Git project is allowed, but Git often helps OpenCode resolve a stable project and worktree.

Recommended command in the target project root:

```powershell
git init
```

This is recommended for stability, especially if runtime files appear to be written into the wrong place or not associated with the expected project.

## Files That Must Exist Together

For repo-local tools to work in another project, the following files must exist together:

- `.opencode/package.json`
- `.opencode/index.ts`
- `.opencode/plugins/index.ts`
- `.opencode/plugins/ai4pb-runtime-tools.ts`
- `.opencode/tools/*.ts`
- `.opencode/lib/*.ts`
- `.opencode/runtime/project-state.json`

If any of those are missing, agent prompts may still load, but runtime-backed behavior can fail silently or degrade into prompt-only behavior.

## Common Failure Modes

### Symptom: tool names appear in the UI, but `project-state.json` does not change

Likely causes:

- the `.opencode` package was not installed
- plugin entrypoints were missing
- the OpenCode session was started before installation
- the target project was resolved to a different worktree

Checks:

- confirm `.opencode/node_modules` exists
- confirm `plugins/index.ts` and `plugins/ai4pb-runtime-tools.ts` exist
- restart OpenCode
- verify the target project root contains `opencode.json`

### Symptom: `ProjectOrchestrator` runs but does not hand tasks to `SystemArchitect`

Likely causes:

- `decompose_goal` did not persist tasks
- runtime state was not re-read before delegation
- the architect handoff payload did not include explicit task IDs

The orchestrator and architect prompts in this bundle are written to require persisted task IDs and reject a missing handoff.

### Symptom: QA or Audit starts too early

This bundle expects validation to be gated by persisted runtime state, not only by narrative child output. If validation still starts too early, inspect whether `Implementation` actually recorded any `done` tasks through `update_graph_model`.

### Symptom: behavior differs between this repository and a copied test project

Likely causes:

- missing root `opencode.json`
- missing `npm install` inside `.opencode`
- missing Git repo initialization
- stale OpenCode session state
- incomplete copy of `.opencode`

## Development Notes

- The `.opencode` directory is treated as a local package.
- Tools are implemented in TypeScript and imported directly by the local plugin entrypoint.
- Runtime files are intentionally stored under `.opencode/runtime` and `.opencode/temp`.
- The shared knowledge graph is separate from the runtime state file.
- `design/KG/SystemArchitecture.json` may still be used as a legacy fallback input, but the canonical writable graph for this bundle lives under `.opencode/temp`.

## Recommended Verification After Copying

After copying this bundle into a target project:

1. Confirm the root project has `opencode.json`.
2. Run `cd .opencode; npm install`.
3. Start a fresh OpenCode session.
4. Invoke the orchestrator with a small test goal.
5. Confirm that `.opencode/runtime/project-state.json` changes.
6. Confirm that `.opencode/temp/SharedKnowledgeGraph.archimate3.1.json` exists and updates.

## Maintenance Guidance

When changing this bundle:

- keep `agents/`, `skills/`, and `tools/` aligned
- keep `plugins/index.ts` and `plugins/ai4pb-runtime-tools.ts` aligned with the actual tool files
- keep `runtimeState.ts` and `sharedKnowledgeGraph.ts` consistent with any path changes
- update this README when initialization or loading assumptions change
