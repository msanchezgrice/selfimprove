import { callClaude } from './call-claude'
import type { ProjectSettingsRow } from '@/lib/types/database'

export interface PRDiff {
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  filePaths: string[]
  hasTests: boolean
  diffContent: string
}

export interface RiskAssessment {
  mechanicalScore: number    // 0-100, higher = riskier
  semanticScore: number      // 0-100, higher = riskier
  combinedScore: number      // 0-100
  decision: 'approve' | 'flag' | 'reject'
  reasons: string[]
  suggestions: string[]
}

// --- Stage 1: Mechanical Risk Scoring ---

interface MechanicalFactors {
  fileCount: number
  lineCount: number
  hasBlockedPaths: boolean
  blockedPaths: string[]
  missingTests: boolean
  largeDiff: boolean
}

function computeMechanicalRisk(diff: PRDiff, settings: ProjectSettingsRow): { score: number; factors: MechanicalFactors } {
  let score = 0
  const factors: MechanicalFactors = {
    fileCount: diff.filesChanged,
    lineCount: diff.linesAdded + diff.linesRemoved,
    hasBlockedPaths: false,
    blockedPaths: [],
    missingTests: false,
    largeDiff: false,
  }

  // File count risk
  if (diff.filesChanged > settings.safety_max_files) {
    score += 25
  } else if (diff.filesChanged > settings.safety_max_files * 0.7) {
    score += 10
  }

  // Line count risk
  const totalLines = diff.linesAdded + diff.linesRemoved
  if (totalLines > settings.safety_max_lines) {
    score += 25
  } else if (totalLines > settings.safety_max_lines * 0.7) {
    score += 10
  }

  // Blocked paths
  const blocked = settings.safety_blocked_paths || []
  const hitPaths = diff.filePaths.filter(fp =>
    blocked.some(bp => fp.startsWith(bp) || fp.includes(bp))
  )
  if (hitPaths.length > 0) {
    score += 30
    factors.hasBlockedPaths = true
    factors.blockedPaths = hitPaths
  }

  // Test requirement
  if (settings.safety_require_tests && !diff.hasTests) {
    score += 15
    factors.missingTests = true
  }

  // Large diff penalty
  if (totalLines > 1000) {
    score += 10
    factors.largeDiff = true
  }

  return { score: Math.min(100, score), factors }
}

// --- Stage 2: Claude Semantic Review ---

interface SemanticReview {
  risk_score: number
  concerns: string[]
  suggestions: string[]
  summary: string
}

const SEMANTIC_SCHEMA = {
  type: 'object' as const,
  properties: {
    risk_score: { type: 'number', minimum: 0, maximum: 100 },
    concerns: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['risk_score', 'concerns', 'suggestions', 'summary'],
}

async function semanticReview(diff: PRDiff, model: string): Promise<SemanticReview> {
  // Truncate diff to avoid exceeding context window
  const truncatedDiff = diff.diffContent.length > 50000
    ? diff.diffContent.slice(0, 50000) + '\n... [truncated]'
    : diff.diffContent

  return callClaude<SemanticReview>({
    prompt: `Review this PR diff for safety and quality issues.

Files changed: ${diff.filesChanged}
Lines added: ${diff.linesAdded}
Lines removed: ${diff.linesRemoved}
Has tests: ${diff.hasTests}

## Diff Content
\`\`\`
${truncatedDiff}
\`\`\`

Evaluate:
1. Could this break existing functionality?
2. Are there security concerns?
3. Is the code quality acceptable?
4. Are there potential performance issues?
5. Is error handling adequate?

Score 0-100 where 0 is perfectly safe and 100 is extremely risky.`,
    system: 'You are a code review bot. Be conservative — flag anything uncertain. Focus on safety, correctness, and security.',
    schema: SEMANTIC_SCHEMA,
    schemaName: 'pr_review',
    model,
    maxTokens: 2048,
  })
}

// --- Stage 3: Decision + Config Overrides ---

export async function reviewPR(
  diff: PRDiff,
  settings: ProjectSettingsRow
): Promise<RiskAssessment> {
  const { score: mechanicalScore, factors } = computeMechanicalRisk(diff, settings)

  const semantic = await semanticReview(diff, settings.ai_model_approval)

  // Weighted combination: 40% mechanical, 60% semantic
  const combinedScore = Math.round(mechanicalScore * 0.4 + semantic.risk_score * 0.6)

  const reasons: string[] = []
  const suggestions: string[] = [...semantic.suggestions]

  if (factors.hasBlockedPaths) {
    reasons.push(`Modifies blocked paths: ${factors.blockedPaths.join(', ')}`)
  }
  if (factors.missingTests) {
    reasons.push('No test files detected in the diff')
  }
  if (factors.largeDiff) {
    reasons.push(`Large diff: ${factors.lineCount} lines changed`)
  }
  if (semantic.concerns.length > 0) {
    reasons.push(...semantic.concerns)
  }

  // Decision based on threshold
  let decision: 'approve' | 'flag' | 'reject'
  if (factors.hasBlockedPaths) {
    decision = 'reject'  // Blocked paths always reject
  } else if (combinedScore <= settings.safety_risk_threshold * 0.5) {
    decision = 'approve'
  } else if (combinedScore <= settings.safety_risk_threshold) {
    decision = 'flag'
  } else {
    decision = 'reject'
  }

  // Config overrides
  if (settings.automation_auto_approve && decision === 'flag' && combinedScore < settings.safety_risk_threshold) {
    decision = 'approve'
    reasons.push('Auto-approved: score within threshold')
  }

  return {
    mechanicalScore,
    semanticScore: semantic.risk_score,
    combinedScore,
    decision,
    reasons,
    suggestions,
  }
}
