# /impact-review

Purpose: compare shipped outcomes to the original forecast and improve the system.

Inputs:
- `PROJECT_ID`
- `OPPORTUNITY_CLUSTER_ID`
- `ROADMAP_ITEM_ID`
- `ACTUAL_METRICS`

Procedure:
1. Load the cluster, roadmap item, PRD metrics, experiment status, and actual metrics.
2. Classify the result:
   - confirmed
   - underperformed
   - inconclusive
3. Explain the most likely reasons for the outcome.
4. Update the relevant project pages and cluster scores with the learning.
5. If the same mistake is likely to recur, propose a skill, trigger, or resolver change.

Outputs:
- `brain_runs`
- Updated cluster ranking data
- Updated project pages
- Candidate updates to skill files or resolver rules
