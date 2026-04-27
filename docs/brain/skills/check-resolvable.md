# /check-resolvable

Purpose: verify that every skill and codepath is reachable from the resolver and still matches real traffic.

Inputs:
- `PROJECT_ID`
- `RESOLVER_TRAFFIC_WINDOW`
- `SKILL_REGISTRY`

Procedure:
1. Read `docs/brain/RESOLVER.md`.
2. Read the trigger registry and list every active skill.
3. Run trigger evals on common user phrasing, cron events, and webhook events.
4. Find false negatives:
   - a skill should fire but does not
5. Find false positives:
   - the wrong skill fires because triggers overlap
6. Find dark capabilities:
   - a skill or codepath exists but has no reachable path from the resolver
7. Propose markdown-only fixes first:
   - trigger examples
   - priority changes
   - fallback paths
8. Record the audit and suggested changes.

Outputs:
- `brain_runs`
- `resolver_audits`
- Candidate updates to `brain_resolver_rules`
