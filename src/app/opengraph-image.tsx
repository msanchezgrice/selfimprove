import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'SelfImprove: You built your v1. Now make it actually work.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#faf8f5',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          color: '#1a1a2e',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          position: 'relative',
        }}
      >
        {/* Decorative line */}
        <div
          style={{
            position: 'absolute',
            height: '3px',
            background: 'linear-gradient(to right, #0d9488, transparent)',
            width: '200px',
            top: '40px',
            right: '60px',
          }}
        />
        {/* Decorative dot */}
        <div
          style={{
            position: 'absolute',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#0d9488',
            opacity: 0.3,
            bottom: '80px',
            right: '40px',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: '72px',
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: '40px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span style={{ color: '#1a1a2e' }}>You built your v1.</span>
            <span style={{ color: '#0d9488' }}>Now make it actually work.</span>
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 400,
              color: '#666',
              letterSpacing: '-0.5px',
            }}
          >
            AI Product Manager for Developers
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            <span style={{ color: '#1a1a2e' }}>Self</span>
            <span style={{ color: '#0d9488' }}>Improve</span>
          </div>
          <div style={{ fontSize: '16px', color: '#999', fontWeight: 500 }}>
            selfimprove.dev
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
