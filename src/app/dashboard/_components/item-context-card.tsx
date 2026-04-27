import Link from 'next/link'

import type {
  OpportunityClusterRow,
  RoadmapItemRow,
  SignalRow,
} from '@/lib/types/database'

/**
 * Sits above the PRD detail and shows everything we know about how this
 * brief came to be: which opportunity_cluster it belongs to, which signal
 * (typically a funnel anomaly) originated it, and how many duplicate
 * briefs were auto-merged into it.
 *
 * Each piece is optional — render only what we have.
 */
export function ItemContextCard({
  projectSlug,
  cluster,
  originatingSignal,
  mergedFrom,
}: {
  projectSlug: string
  cluster: OpportunityClusterRow | null
  originatingSignal:
    | (Pick<SignalRow, 'id' | 'type' | 'title' | 'content' | 'created_at'> & {
        metadata?: Record<string, unknown> | null
      })
    | null
  mergedFrom: Array<Pick<RoadmapItemRow, 'id' | 'title' | 'updated_at'>>
}) {
  if (!cluster && !originatingSignal && mergedFrom.length === 0) return null

  return (
    <section
      className="mb-6 rounded-lg border p-4"
      style={{ borderColor: '#e5e1d8', backgroundColor: '#fafaf7' }}
    >
      <h2
        className="mb-3 text-xs uppercase tracking-wide"
        style={{ color: '#8b8680' }}
      >
        Context
      </h2>

      <div className="grid gap-4 md:grid-cols-3">
        {cluster ? (
          <ContextBlock
            label="Opportunity cluster"
            help="The thematic group this brief belongs to. Click to see all linked items + evidence."
          >
            <Link
              href={`/dashboard/${projectSlug}/clusters/${cluster.slug}`}
              className="hover:underline"
              style={{ color: '#6366f1' }}
            >
              {cluster.slug}
            </Link>
            <div className="mt-1 text-xs" style={{ color: '#8b8680' }}>
              {cluster.primary_need} / {cluster.theme ?? 'general'} · focus{' '}
              {Math.round(cluster.focus_weighted_score)} · evidence{' '}
              {Math.round(cluster.evidence_strength)}
            </div>
          </ContextBlock>
        ) : (
          <ContextBlock
            label="Opportunity cluster"
            help="No cluster assigned. Will be filed when the next bootstrap or rollup runs."
          >
            <span className="text-xs" style={{ color: '#8b8680' }}>
              unfiled
            </span>
          </ContextBlock>
        )}

        {originatingSignal ? (
          <ContextBlock
            label="Originating signal"
            help="The signal that caused this brief to be synthesized. Funnel anomalies, user feedback, error spikes, etc."
          >
            <div style={{ color: '#1a1a2e' }}>{originatingSignal.title}</div>
            <div className="mt-1 text-xs" style={{ color: '#8b8680' }}>
              {originatingSignal.type} ·{' '}
              {new Date(originatingSignal.created_at).toLocaleDateString()}
              {originatingSignal.metadata &&
                typeof originatingSignal.metadata === 'object' &&
                'event_name' in originatingSignal.metadata && (
                  <>
                    {' \u00b7 '}
                    <code style={{ fontSize: '11px' }}>
                      {String(
                        (originatingSignal.metadata as { event_name?: string })
                          .event_name ?? '',
                      )}
                    </code>
                  </>
                )}
            </div>
          </ContextBlock>
        ) : (
          <ContextBlock
            label="Originating signal"
            help="No specific signal — this brief came from a synthesis pass over batched evidence."
          >
            <span className="text-xs" style={{ color: '#8b8680' }}>
              from batched synthesis
            </span>
          </ContextBlock>
        )}

        <ContextBlock
          label={mergedFrom.length > 0 ? 'Merged duplicates' : 'No duplicates'}
          help="Briefs the dedup pass merged INTO this one. Their content was redundant; only the canonical (this) row survives."
        >
          {mergedFrom.length === 0 ? (
            <span className="text-xs" style={{ color: '#8b8680' }}>
              none
            </span>
          ) : (
            <>
              <div style={{ color: '#1a1a2e' }}>
                <strong>{mergedFrom.length}</strong>{' '}
                duplicate{mergedFrom.length === 1 ? '' : 's'} auto-merged
              </div>
              <ul className="mt-1 space-y-0.5 text-xs" style={{ color: '#8b8680' }}>
                {mergedFrom.slice(0, 3).map((m) => (
                  <li key={m.id} className="truncate">
                    {'\u00b7 '}
                    {m.title}
                  </li>
                ))}
                {mergedFrom.length > 3 && <li>{'\u00b7 +'}{mergedFrom.length - 3} more</li>}
              </ul>
            </>
          )}
        </ContextBlock>
      </div>
    </section>
  )
}

function ContextBlock({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div title={help}>
      <div
        className="mb-1 text-[10px] uppercase tracking-wide"
        style={{ color: '#bdb9b1' }}
      >
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  )
}
