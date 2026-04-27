import {
  BRAIN_DIAGRAMS,
  type BrainDiagram,
  type DiagramAnchor,
  type DiagramEdge,
  type DiagramEdgeTone,
  type DiagramNode,
  type DiagramNodeTone,
} from '@/lib/brain/diagrams'

const NODE_STYLES: Record<
  DiagramNodeTone,
  { fill: string; stroke: string; text: string; detail: string; label: string }
> = {
  signal: {
    fill: '#ffe6d7',
    stroke: '#cf7844',
    text: '#602d18',
    detail: '#8d4a25',
    label: 'Signal',
  },
  memory: {
    fill: '#deecff',
    stroke: '#6d88bb',
    text: '#1f4064',
    detail: '#4a6a94',
    label: 'Memory',
  },
  skill: {
    fill: '#f8e4bc',
    stroke: '#b57c25',
    text: '#55370d',
    detail: '#8b5f18',
    label: 'Skill',
  },
  agent: {
    fill: '#f4defd',
    stroke: '#9a5cc2',
    text: '#51206b',
    detail: '#774593',
    label: 'Agent',
  },
  harness: {
    fill: '#ece7ff',
    stroke: '#776ad9',
    text: '#34297f',
    detail: '#5b4fbb',
    label: 'Harness',
  },
  foundation: {
    fill: '#e4f3e3',
    stroke: '#66926d',
    text: '#25452d',
    detail: '#477356',
    label: 'Deterministic',
  },
  artifact: {
    fill: '#fff0c8',
    stroke: '#c18c2e',
    text: '#5f4311',
    detail: '#8a6723',
    label: 'Artifact',
  },
  metric: {
    fill: '#ffddea',
    stroke: '#c26686',
    text: '#5f2237',
    detail: '#8b4560',
    label: 'Metric',
  },
}

const EDGE_STYLES: Record<
  DiagramEdgeTone,
  { stroke: string; markerFill: string; opacity: number }
> = {
  default: {
    stroke: '#6e655d',
    markerFill: '#6e655d',
    opacity: 1,
  },
  feedback: {
    stroke: '#b6557b',
    markerFill: '#b6557b',
    opacity: 0.95,
  },
  muted: {
    stroke: '#9b9086',
    markerFill: '#9b9086',
    opacity: 0.8,
  },
}

function wrapLines(text: string, maxChars: number) {
  return text
    .split('\n')
    .flatMap((segment) => {
      const words = segment.split(' ')
      const lines: string[] = []
      let current = ''

      for (const word of words) {
        const next = current ? `${current} ${word}` : word
        if (next.length <= maxChars) {
          current = next
          continue
        }

        if (current) {
          lines.push(current)
        }
        current = word
      }

      if (current) {
        lines.push(current)
      }

      return lines
    })
}

function getAnchorPoint(node: DiagramNode, side: DiagramAnchor) {
  switch (side) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y }
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 }
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height }
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 }
  }
}

function inferAnchor(from: DiagramNode, to: DiagramNode): DiagramAnchor {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }

  return dy >= 0 ? 'bottom' : 'top'
}

function oppositeAnchor(anchor: DiagramAnchor): DiagramAnchor {
  switch (anchor) {
    case 'top':
      return 'bottom'
    case 'right':
      return 'left'
    case 'bottom':
      return 'top'
    case 'left':
      return 'right'
  }
}

function buildEdge(edge: DiagramEdge, nodes: Map<string, DiagramNode>) {
  const fromNode = nodes.get(edge.from)
  const toNode = nodes.get(edge.to)

  if (!fromNode || !toNode) {
    throw new Error(`Unknown edge endpoints: ${edge.from} -> ${edge.to}`)
  }

  const fromSide = edge.fromSide ?? inferAnchor(fromNode, toNode)
  const toSide = edge.toSide ?? oppositeAnchor(fromSide)

  const points = [
    getAnchorPoint(fromNode, fromSide),
    ...(edge.waypoints ?? []),
    getAnchorPoint(toNode, toSide),
  ]

  const path = points
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(' ')

  const segmentIndex = Math.floor((points.length - 1) / 2)
  const start = points[segmentIndex] ?? points[0]
  const end = points[segmentIndex + 1] ?? points[points.length - 1]
  const labelPoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }

  return { path, labelPoint }
}

function DiagramNodeCard({ node }: { node: DiagramNode }) {
  const style = NODE_STYLES[node.tone]
  const titleLines = wrapLines(node.label, Math.max(11, Math.floor(node.width / 11)))
  const detailLines = node.detail
    ? wrapLines(node.detail, Math.max(13, Math.floor(node.width / 12)))
    : []

  const titleHeight = titleLines.length * 18
  const detailHeight = detailLines.length * 14
  const totalHeight = titleHeight + (detailLines.length > 0 ? 10 : 0) + detailHeight
  const startY = node.y + (node.height - totalHeight) / 2 + 14

  return (
    <g>
      <rect
        x={node.x + 4}
        y={node.y + 6}
        width={node.width}
        height={node.height}
        rx={18}
        fill="rgba(62, 41, 26, 0.08)"
      />
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={18}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={2}
      />
      <text
        x={node.x + node.width / 2}
        y={startY}
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill={style.text}
      >
        {titleLines.map((line, index) => (
          <tspan
            key={`${node.id}-title-${line}`}
            x={node.x + node.width / 2}
            dy={index === 0 ? 0 : 18}
          >
            {line}
          </tspan>
        ))}
      </text>
      {detailLines.length > 0 && (
        <text
          x={node.x + node.width / 2}
          y={startY + titleHeight + 8}
          textAnchor="middle"
          fontSize="12"
          fontWeight="500"
          fill={style.detail}
        >
          {detailLines.map((line, index) => (
            <tspan
              key={`${node.id}-detail-${line}`}
              x={node.x + node.width / 2}
              dy={index === 0 ? 0 : 14}
            >
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  )
}

function DiagramSvg({ diagram }: { diagram: BrainDiagram }) {
  const nodeMap = new Map(diagram.nodes.map((node) => [node.id, node]))
  const usedTones = Array.from(new Set(diagram.nodes.map((node) => node.tone)))

  return (
    <article
      className="rounded-[2rem] border p-6"
      style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.8)' }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: '#8b5e34' }}
          >
            {diagram.eyebrow}
          </p>
          <h3 className="mt-2 text-2xl font-semibold" style={{ color: '#1f1a17' }}>
            {diagram.title}
          </h3>
          <p className="mt-2 text-sm leading-6" style={{ color: '#5d5750' }}>
            {diagram.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {usedTones.map((tone) => {
            const style = NODE_STYLES[tone]
            return (
              <span
                key={`${diagram.slug}-${tone}`}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: style.stroke,
                  backgroundColor: style.fill,
                  color: style.text,
                }}
              >
                {style.label}
              </span>
            )
          })}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-[1.6rem] border" style={{ borderColor: '#e6ddd3' }}>
        <svg
          viewBox={`0 0 ${diagram.width} ${diagram.height}`}
          className="h-auto min-w-[960px] w-full"
          role="img"
          aria-label={diagram.title}
          style={{ backgroundColor: '#fffaf4' }}
        >
          <defs>
            <pattern
              id={`grid-${diagram.slug}`}
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="#ece2d7"
                strokeWidth="1"
              />
            </pattern>
            {Object.entries(EDGE_STYLES).map(([tone, style]) => (
              <marker
                key={`${diagram.slug}-${tone}`}
                id={`arrow-${diagram.slug}-${tone}`}
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 12 6 L 0 12 z" fill={style.markerFill} />
              </marker>
            ))}
          </defs>

          <rect
            x="0"
            y="0"
            width={diagram.width}
            height={diagram.height}
            fill={`url(#grid-${diagram.slug})`}
          />

          {diagram.zones.map((zone) => (
            <g key={zone.id}>
              <rect
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                rx={28}
                fill={zone.fill}
                fillOpacity={0.72}
                stroke={zone.stroke}
                strokeWidth={2}
                strokeDasharray="8 10"
              />
              <text
                x={zone.x + 20}
                y={zone.y + 28}
                fontSize="13"
                fontWeight="700"
                letterSpacing="0.14em"
                fill={zone.textColor}
              >
                {zone.label.toUpperCase()}
              </text>
            </g>
          ))}

          {diagram.edges.map((edge) => {
            const tone = edge.tone ?? 'default'
            const style = EDGE_STYLES[tone]
            const { path, labelPoint } = buildEdge(edge, nodeMap)
            const labelWidth = edge.label ? Math.max(58, edge.label.length * 8.1) : 0

            return (
              <g key={`${diagram.slug}-${edge.from}-${edge.to}-${edge.label ?? 'edge'}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={edge.dashed ? 2.2 : 2.6}
                  strokeDasharray={edge.dashed ? '8 8' : undefined}
                  opacity={style.opacity}
                  markerEnd={`url(#arrow-${diagram.slug}-${tone})`}
                />
                {edge.label && (
                  <>
                    <rect
                      x={labelPoint.x - labelWidth / 2}
                      y={labelPoint.y - 13}
                      width={labelWidth}
                      height={24}
                      rx={12}
                      fill="rgba(255, 250, 244, 0.94)"
                      stroke="rgba(143, 126, 111, 0.38)"
                    />
                    <text
                      x={labelPoint.x}
                      y={labelPoint.y + 4}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fill={style.stroke}
                    >
                      {edge.label}
                    </text>
                  </>
                )}
              </g>
            )
          })}

          {diagram.nodes.map((node) => (
            <DiagramNodeCard key={node.id} node={node} />
          ))}
        </svg>
      </div>
    </article>
  )
}

export function BrainDiagramGallery() {
  return (
    <section
      className="mt-8 rounded-[2rem] border p-6"
      style={{ borderColor: '#d9d0c5', backgroundColor: 'rgba(255,255,255,0.75)' }}
    >
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold" style={{ color: '#1f1a17' }}>
          Visual Models
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: '#5d5750' }}>
          These diagrams visualize the architectural shift: what Garry’s thesis means in the abstract, how it changes SelfImprove’s current flow, and how resolver-driven learning compounds over time.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {BRAIN_DIAGRAMS.map((diagram) => (
          <DiagramSvg key={diagram.slug} diagram={diagram} />
        ))}
      </div>
    </section>
  )
}
