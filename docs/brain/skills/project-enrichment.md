# /project-enrichment

Purpose: convert raw product and repo evidence into durable project pages and opportunity clusters.

Inputs:
- `PROJECT_ID`
- `SIGNAL_BATCH`
- `SCAN_FINDINGS`
- `RECENT_SHIPS`

Procedure:
1. Read `docs/brain/RESOLVER.md` and `docs/brain/skills/_filing-rules.md` before creating anything new.
2. Scope which pages and opportunity clusters could change from the incoming evidence.
3. Read all relevant evidence in full before summarizing.
4. Diarize contradictions, repeated pain, repo facts, new risks, and shifts in dominant need.
5. Update the minimum set of project pages needed to capture the change.
6. Attach evidence to an existing opportunity cluster whenever possible; create a new cluster only when the filing rules justify it.
7. Record exact source links for every important claim.
8. Chunk the updated pages for retrieval.
9. Mark downstream pages or clusters stale if the new truth changes their assumptions.

Outputs:
- Updated `brain_pages`
- New `brain_page_versions`
- `brain_page_sources`
- `brain_chunks`
- Updated `opportunity_clusters`
- `opportunity_cluster_sources`
