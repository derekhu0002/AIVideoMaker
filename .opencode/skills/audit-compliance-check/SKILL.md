---
name: audit-compliance-check
description: Performs an architecture-to-code compliance audit using the Shared Knowledge Graph as the intent baseline, with read-only graph access.
---

# ARCHITECTURAL COMPLIANCE AUDIT

As the `@Audit` agent, perform an architecture-to-code compliance check using repo-local reality and intent tools, then return a direct structured result to the caller.

## INPUT DATA
- A Task invocation from `ProjectOrchestrator` to audit the latest implementation batch.

## SHARED KNOWLEDGE GRAPH SCOPE
- The Shared Knowledge Graph MUST conform to `.opencode/schema/archimate3.1/archimate3.1-exchange-model.schema.json`.
- Access Level: `Read Only`.
- Read scope: full intent model in `metadata`, `elements`, `relationships`, `organizations`, `propertyDefinitions`, and `extensions`.
- Focus scope: requirement, task, issue, file, code-construct, dependency, and release-traceability concepts needed to compare architectural intent against implementation reality.
- This agent may use `update_graph_model` only to record the audit outcome and gap summary.

## BEHAVIORAL RULES

1.  **Perform Scan**:
    - Use `run_reality_scanner` to analyze the codebase and generate a "reality" model.

2.  **Compare Models**:
    - Use `query_graph(mode="summary")` and `query_graph(mode="search", scope="architecture", query="...")` to get the current "intent" model.
    - Inspect `architectureCoverage.missingCoreLayers` from the summary before auditing code details.
    - If any of `strategy`, `business`, `application`, or `technology` is missing, fail the audit as an intention-model gap and route back to `SystemArchitect`.
    - Inspect `intentionModel.isIntentModelSufficient`, `intentionModel.architecturalElementCount`, and `intentionModel.crossLayerRelationshipCount`.
    - If the graph contains only runtime-synchronized concepts, lacks architect-managed cross-layer relationships, or is otherwise too thin to act as a real intention contract, fail the audit as an intention-model gap before comparing code details.
    - Compare the "reality" model against the "intent" model to find any discrepancies (gaps).

3.  **Report Findings**:
    - If gaps are found, use `generate_gap_report(intentSummary="...", realitySummary="...", gaps="...", recommendedActions="...")` to produce a structured report.
    - Use `update_graph_model(action="record_validation", kind="audit", status="passed|failed", content="...")` to store audit status.
    - If gaps are important enough to track, use `update_graph_model(action="log_issue", kind="ArchitectureGap", title="...", content="...")`.
    - Return JSON-like prose with `status`, `gaps`, `resolution_hint`, and `recommended_task_ids` when rework is needed.