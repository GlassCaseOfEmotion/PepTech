import { loginAction } from './actions'

interface Props {
  searchParams: Promise<{ error?: string; message?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const { error, message } = await searchParams

  return (
    <div className="pt-root no-right" style={{ placeItems: 'center', display: 'grid', height: '100vh' }}>
      <div style={{ width: 360 }}>
        <div className="pt-brand" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <div className="pt-brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path d="M3 10.5 7 5.5h6l4 5-4 5H7l-4-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="10" cy="10.5" r="2" fill="currentColor"/>
            </svg>
          </div>
          <div className="pt-brand-name">Peptech<span>.</span></div>
        </div>

        {error && (
          <p style={{ color: 'var(--pt-danger)', fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
            {error}
          </p>
        )}
        {message && (
          <p style={{ color: 'var(--pt-ok)', fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
            {message}
          </p>
        )}

        <form action={loginAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            style={{
              height: 36, padding: '0 12px', borderRadius: 'var(--pt-radius)',
              border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
              font: 'inherit', fontSize: 13, color: 'var(--pt-fg)', outline: 'none',
            }}
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            style={{
              height: 36, padding: '0 12px', borderRadius: 'var(--pt-radius)',
              border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
              font: 'inherit', fontSize: 13, color: 'var(--pt-fg)', outline: 'none',
            }}
          />
          <button
            type="submit"
            className="pt-btn pt-btn-primary"
            style={{ height: 36, justifyContent: 'center' }}
          >
            Sign in
          </button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--pt-fg-3)', textAlign: 'center', marginTop: 16 }}>
          No account?{' '}
          <a href="/signup" style={{ color: 'var(--pt-accent-fg)' }}>Sign up</a>
        </p>
      </div>
    </div>
  )
}
