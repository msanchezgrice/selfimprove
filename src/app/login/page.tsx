import type { Metadata } from 'next'
import { OAuthButtons } from './_components/oauth-buttons'

export const metadata: Metadata = {
  title: 'Sign In',
  description:
    'Sign in to SelfImprove to access your AI-powered product management dashboard. Watch your users, build your roadmap, and ship the right fixes.',
  alternates: { canonical: '/login' },
  robots: 'noindex, follow',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#faf8f5',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: '#ffffff',
          border: '1px solid #e8e4de',
          borderRadius: '14px',
          padding: '40px 32px',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              backgroundColor: '#eef2ff',
              borderRadius: '12px',
              marginBottom: '20px',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 600,
              color: '#1a1a1a',
              margin: '0 0 8px 0',
              fontFamily:
                'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Sign in to SelfImprove
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#6b6560',
              margin: 0,
            }}
          >
            Ship what your users actually want.
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              marginBottom: '24px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '14px',
            }}
          >
            Authentication failed. Please try again.
          </div>
        )}

        <OAuthButtons />

        <p
          style={{
            textAlign: 'center',
            fontSize: '12px',
            color: '#9b9590',
            marginTop: '24px',
            lineHeight: '1.5',
          }}
        >
          By signing in, you agree to our Terms of Service
        </p>
      </div>
    </div>
  )
}
