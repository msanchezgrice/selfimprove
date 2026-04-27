# /implementation-brief

Purpose: compress an approved PRD into the smallest reliable execution packet for a coding agent.

Inputs:
- `PROJECT_ID`
- `ROADMAP_ITEM_ID`
- `PRD_CONTENT`
- `APPROVAL_MODE`

Procedure:
1. Load the PRD and the latest `repo_map`.
2. Load safety rules, blocked paths, and the active approval policy.
3. Extract the minimum required files, tests, and rollout constraints.
4. Emit a structured execution packet instead of a freeform prompt blob.
5. Preserve exact references back to the PRD, cluster, and project memory pages.

Outputs:
- `brain_runs`
- A structured `build_jobs` payload
