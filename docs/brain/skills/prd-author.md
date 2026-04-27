# /prd-author

Purpose: expand a selected opportunity cluster into a repo-aware PRD.

Inputs:
- `PROJECT_ID`
- `OPPORTUNITY_CLUSTER_ID`
- `ROADMAP_ITEM_ID`
- `USER_FEEDBACK`

Procedure:
1. Load the selected cluster and the attached roadmap item.
2. Resolve `project_overview`, `current_focus`, `repo_map`, `implementation_patterns`, `safety_rules`, and `metric_definitions`.
3. Read recent shipped changes that touch the same area.
4. Draft the PRD:
   - problem and context
   - why this matters now
   - solution and rollout
   - acceptance criteria
   - file-level plan
   - tests and analytics
   - rollback and risk notes
5. Call out open questions explicitly instead of burying them in prose.
6. Write back any new repo or product truths learned while authoring.

Outputs:
- `brain_runs`
- `roadmap_items.prd_content`
- Updated project pages if the PRD surfaced durable new knowledge
