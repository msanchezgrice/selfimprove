# Filing Rules

Purpose: stop every skill from inventing its own storage logic.

## Default Rule

File by primary product subject, not by source format or by skill name.

Bad:
- "this came from analytics, so it belongs in analytics notes"
- "this came from scan-codebase, so it belongs in scan output"

Good:
- "this is evidence about onboarding friction, so attach it to that cluster"
- "this changes our understanding of the repo, so update the repo map"

## Common Mistakes

### Signals vs. Opportunity Clusters

- `signals` are raw evidence.
- `opportunity_clusters` are maintained product opportunities.

Do not create a new cluster when a signal merely strengthens an existing theme.

### Pages vs. Clusters

- pages hold durable truth
- clusters hold candidate bets and ranked opportunities

If the evidence changes what we know, update a page.
If the evidence changes what we might build, update a cluster.
Sometimes both should happen.

### Source Format vs. Product Meaning

The source format is not the filing destination.

- a support ticket about pricing confusion belongs with pricing opportunity clusters
- a repo scan that finds build slowness belongs with performance clusters and possibly the repo map
- an analytics anomaly about signup drop-off belongs with conversion work, not a generic metrics bucket

### New Cluster Threshold

Create a new cluster only when:

1. no active cluster covers the same problem
2. the signal is not a one-off complaint
3. there is enough evidence to name the opportunity clearly

Otherwise, attach to the nearest existing cluster and update its scores.

## Required Step

Before creating any new page or cluster, read:

1. `docs/brain/RESOLVER.md`
2. this filing rules document

If the path is still ambiguous, prefer attaching evidence to an existing object over creating a new one.
