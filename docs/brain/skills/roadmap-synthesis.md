# /roadmap-synthesis

Purpose: maintain a long backlog of opportunity clusters and refresh the ranked roadmap slice under the current dominant need.

Inputs:
- `PROJECT_ID`
- `CURRENT_FOCUS`
- `CHANGED_CLUSTER_WINDOW`

Procedure:
1. Resolve `current_focus`, `project_overview`, `user_pain_map`, `active_experiments`, `open_decisions`, and `release_notes`.
2. Read only the fresh evidence that has not yet been compacted into those pages or clusters.
3. Run the filing resolver first:
   - attach evidence to an existing cluster
   - create a new cluster only if no active cluster fits
   - update pages when shared truth changed
4. Refresh only changed or high-uncertainty clusters, not every brief in the backlog.
5. Separate latent judgment from deterministic math:
   - The model chooses themes, scope, strategy, and why-now framing.
   - Code computes evidence strength, freshness, confidence, effort, and focus weighting.
6. Refresh the ranked roadmap slice from the maintained clusters.
7. Write back any changed truths or open questions discovered during synthesis.

Outputs:
- `brain_runs`
- Updated `opportunity_clusters`
- New or updated `roadmap_items`
- Updated project pages when the synthesis changes shared understanding
