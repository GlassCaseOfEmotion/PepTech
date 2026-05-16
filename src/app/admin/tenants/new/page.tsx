import { createTenant } from '../../actions'

export default function NewTenantPage() {
  return (
    <>
      <div className="pt-page-hd" style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>New tenant</h1>
      </div>
      <div className="pt-card" style={{ maxWidth: 480 }}>
        <div className="pt-card-hd"><h3>Provision tenant</h3></div>
        <div className="pt-card-body">
          <form action={createTenant} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 4, color: 'var(--pt-fg-3)' }}>Business name</div>
              <input name="name" required className="pt-input" style={{ width: '100%' }} />
            </label>
            <label style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 4, color: 'var(--pt-fg-3)' }}>Owner email</div>
              <input name="email" type="email" required className="pt-input" style={{ width: '100%' }} />
            </label>
            <label style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 4, color: 'var(--pt-fg-3)' }}>Initial password</div>
              <input name="password" type="password" required className="pt-input" style={{ width: '100%' }} />
            </label>
            <label style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 4, color: 'var(--pt-fg-3)' }}>Plan</div>
              <select name="plan" className="pt-input" style={{ width: '100%' }}>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <button type="submit" className="pt-btn pt-btn-primary">Create tenant</button>
          </form>
        </div>
      </div>
    </>
  )
}
