import { signupAction } from './actions'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function SignupPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: 'var(--pt-bg)', color: 'var(--pt-fg)' }}>
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

        <form action={signupAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            name="businessName"
            type="text"
            placeholder="Business name"
            required
            style={{
              height: 36, padding: '0 12px', borderRadius: 'var(--pt-radius)',
              border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
              font: 'inherit', fontSize: 13, color: 'var(--pt-fg)', outline: 'none',
            }}
          />
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
            minLength={8}
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
            Create workspace
          </button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--pt-fg-3)', textAlign: 'center', marginTop: 16 }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: 'var(--pt-accent-fg)' }}>Sign in</a>
        </p>
      </div>
    </div>
  )
}
