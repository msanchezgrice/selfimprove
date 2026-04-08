'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
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

  const handleGoLive = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const slug = slugify(projectName)

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          org_id: orgId,
          name: projectName.trim(),
          slug,
          repo_url: repoUrl || null,
          site_url: siteUrl || null,
          framework: framework || null,
          allowed_domains: siteUrl ? [new URL(siteUrl).hostname] : [],
        })
        .select('id')
        .single()

      if (projectError || !project) {
        throw new Error(projectError?.message ?? 'Failed to create project')
      }

      // Create project settings
      const { error: settingsError } = await supabase
        .from('project_settings')
        .insert({
          project_id: project.id,
          automation_roi_focus: roiFocus,
          automation_implement_enabled: autoImplement,
          safety_risk_threshold: riskThreshold,
          widget_enabled: sources.widget,
          voice_enabled: sources.voice,
          posthog_api_key: null,
          sentry_dsn: null,
        })

      if (settingsError) {
        throw new Error(settingsError.message)
      }

      router.push('/dashboard')
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
        {step === 3 && <StepAddWidget />}
        {step === 4 && (
          <StepConfigureAi
            roiFocus={roiFocus}
            setRoiFocus={setRoiFocus}
            autoImplement={autoImplement}
            setAutoImplement={setAutoImplement}
            riskThreshold={riskThreshold}
            setRiskThreshold={setRiskThreshold}
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
              onClick={() => setStep((s) => s + 1)}
              disabled={!canContinue()}
              className="text-sm font-semibold px-6 py-2.5 rounded-xl text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: '#6366f1' }}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
