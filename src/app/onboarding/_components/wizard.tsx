'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RoiFocus } from '@/lib/types/database'
import { StepConnectRepo } from './step-connect-repo'
import { StepSelectSources } from './step-select-sources'
import { StepAddWidget } from './step-add-widget'
import { StepConfigureAi } from './step-configure-ai'
import { StepGoLive } from './step-go-live'

type OnboardingWizardProps = {
  orgId: string
}

const TOTAL_STEPS = 5

const stepTitles = [
  'Connect Repo',
  'Sources',
  'Widget',
  'AI PM',
  'Go Live',
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'project'
}

export function OnboardingWizard({ orgId }: OnboardingWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Project ID and slug created in step 1
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectSlug, setProjectSlug] = useState<string | null>(null)

  // Product context from AI analysis (fires after step 1)
  const [productContext, setProductContext] = useState<{
    description: string
    target_users: string
    features: string
    priority_suggestion: string
  } | null>(null)
  const [analyzingContext, setAnalyzingContext] = useState(false)

  // Step 1: Connect Repo
  const [projectName, setProjectName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [framework, setFramework] = useState('')

  // Step 2: Select Sources
  const [sources, setSources] = useState({
    widget: true,
    voice: false,
    posthog: false,
    sentry: false,
  })

  // Step 4: Configure AI
  const [roiFocus, setRoiFocus] = useState<RoiFocus>('balanced')
  const [autoImplement, setAutoImplement] = useState(false)
  const [riskThreshold, setRiskThreshold] = useState(50)

  const canContinue = () => {
    if (step === 1) return projectName.trim().length > 0
    return true
  }

  const handleStep1Continue = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          name: projectName.trim(),
          slug: slugify(projectName),
          repo_url: repoUrl || null,
          site_url: siteUrl || null,
          framework: framework || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to create project')
      }

      const { id } = await res.json()
      setProjectId(id)
      setProjectSlug(slugify(projectName))

      // Fire analysis in background (don't await — let it complete while user goes through steps 2-3)
      setAnalyzingContext(true)
      fetch(`/api/projects/${id}/analyze`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (!data.error) setProductContext(data)
        })
        .catch(() => {})
        .finally(() => setAnalyzingContext(false))

      setStep(2)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Project creation error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleGoLive = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      // Update project settings — project already exists from step 1
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: repoUrl || null,
          site_url: siteUrl || null,
          framework: framework || null,
          settings: {
            automation_roi_focus: roiFocus,
            automation_implement_enabled: autoImplement,
            safety_risk_threshold: riskThreshold,
            widget_enabled: sources.widget,
            voice_enabled: sources.voice,
          },
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to update project')
      }

      // Set the active project cookie so dashboard loads the new project
      if (projectId) {
        document.cookie = `selfimprove_project=${projectId};path=/;max-age=31536000`
      }
      router.push(projectSlug ? `/dashboard/${projectSlug}/roadmap` : '/dashboard')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Onboarding error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="w-full" style={{ maxWidth: '520px' }}>
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const stepNum = i + 1
          const isActive = stepNum === step
          const isCompleted = stepNum < step
          return (
            <div key={stepNum} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: isActive
                      ? '#6366f1'
                      : isCompleted
                        ? '#059669'
                        : '#e8e4de',
                    color:
                      isActive || isCompleted ? '#ffffff' : '#8b8680',
                  }}
                >
                  {isCompleted ? '\u2713' : stepNum}
                </div>
                <span
                  className="text-xs mt-1 hidden sm:block"
                  style={{
                    color: isActive ? '#6366f1' : '#8b8680',
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {stepTitles[i]}
                </span>
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div
                  className="w-8 h-0.5 rounded-full mb-4 sm:mb-0"
                  style={{
                    backgroundColor: isCompleted ? '#059669' : '#e8e4de',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Card */}
      <div
        className="rounded-[14px] border p-8"
        style={{
          backgroundColor: '#ffffff',
          borderColor: '#e8e4de',
        }}
      >
        {step === 1 && (
          <StepConnectRepo
            projectName={projectName}
            setProjectName={setProjectName}
            repoUrl={repoUrl}
            setRepoUrl={setRepoUrl}
            siteUrl={siteUrl}
            setSiteUrl={setSiteUrl}
            framework={framework}
            setFramework={setFramework}
          />
        )}
        {step === 2 && (
          <StepSelectSources sources={sources} setSources={setSources} />
        )}
        {step === 3 && <StepAddWidget projectId={projectId} />}
        {step === 4 && (
          <StepConfigureAi
            roiFocus={roiFocus}
            setRoiFocus={setRoiFocus}
            autoImplement={autoImplement}
            setAutoImplement={setAutoImplement}
            riskThreshold={riskThreshold}
            setRiskThreshold={setRiskThreshold}
            productContext={productContext}
            analyzingContext={analyzingContext}
          />
        )}
        {step === 5 && (
          <StepGoLive
            projectName={projectName}
            repoUrl={repoUrl}
            sources={sources}
            roiFocus={roiFocus}
            autoImplement={autoImplement}
            onGoLive={handleGoLive}
            loading={loading}
          />
        )}

        {/* Navigation buttons (not shown on step 5 — it has its own CTA) */}
        {step < 5 && (
          <div className="flex items-center justify-between mt-8 pt-5 border-t" style={{ borderColor: '#e8e4de' }}>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                style={{ color: '#8b8680' }}
              >
                Back
              </button>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={step === 1 ? handleStep1Continue : () => setStep((s) => s + 1)}
              disabled={!canContinue() || loading}
              className="text-sm font-semibold px-6 py-2.5 rounded-xl text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: '#6366f1' }}
            >
              {step === 1 && loading ? 'Creating...' : 'Continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
