'use client'

/**
 * App-wide client-side error boundary. Next.js App Router catches any
 * uncaught error rendered below and shows this component instead of the
 * bare "Application error" default. `reset` retries rendering the segment;
 * we also offer a hard-reload and a back-to-dashboard escape hatch.
 *
 * Keep this lightweight and self-contained — it should render even if other
 * stylesheets / providers fail to load.
 */

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to the browser console + Vercel's error reporting (Next forwards
    // these to its server-side log automatically when the component renders).
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        background: 'var(--pt-bg, #fafaf9)',
        fontFamily: 'var(--pt-font, system-ui, -apple-system, sans-serif)',
        color: 'var(--pt-fg, #1a1a1a)',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          padding: '36px 32px',
          background: 'var(--pt-surface, #fff)',
          border: '1px solid var(--pt-line, rgba(0,0,0,0.08))',
          borderRadius: 16,
          boxShadow: '0 16px 36px -24px rgba(0,0,0,0.18)',
        }}
      >
        <div
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--pt-accent-soft, rgba(120, 160, 100, 0.14))',
            color: 'var(--pt-accent, #6aa56a)',
            marginBottom: 18,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 8v5M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
          Something went wrong on this page
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--pt-fg-3, #5a5a5a)', margin: '0 0 22px' }}>
          We&apos;ve logged the error. You can try again — and if it keeps happening, head back to the dashboard and we&apos;ll take a look.
        </p>

        {error.digest && (
          <p style={{ fontSize: 11, color: 'var(--pt-fg-4, #999)', margin: '0 0 22px', fontFamily: 'var(--pt-mono, ui-monospace, monospace)' }}>
            Reference: {error.digest}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '9px 16px',
              background: 'var(--pt-accent, #6aa56a)',
              color: 'var(--pt-accent-fg, #fff)',
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <Link
            href="/"
            style={{
              padding: '9px 16px',
              background: 'transparent',
              color: 'var(--pt-fg, #1a1a1a)',
              border: '1px solid var(--pt-line, rgba(0,0,0,0.1))',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
