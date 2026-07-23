import { OAuthButtons } from './_components/oauth-buttons'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in or create a Ships Itself account with GitHub or Google.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: false },
}

const ERROR_MESSAGES: Record<string, string> = {
  oauth_start_failed: 'Could not start the sign-in flow. Please try again.',
  invalid_link: 'That sign-in link is invalid or expired. Please sign in again.',
  account_setup: 'Sign-in succeeded but account setup failed. Please try again.',
  auth_failed: 'Authentication failed. Please try again.',
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
            Sign in to Ships Itself
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
            {ERROR_MESSAGES[error] ?? 'Authentication failed. Please try again.'}
            <span style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#b91c1c' }}>
              Code: {error}
            </span>
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
          By signing in, you agree to our{' '}
          <Link href="/terms" style={{ color: '#6366f1' }}>Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" style={{ color: '#6366f1' }}>Privacy Policy</Link>.
        </p>
      </div>
    </div>
  )
}
