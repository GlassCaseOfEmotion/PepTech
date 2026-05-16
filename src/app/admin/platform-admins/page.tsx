import { redirect } from 'next/navigation'
import { getServerUser, createServiceClient } from '@/lib/supabase/server'
import { grantPlatformAdmin, revokePlatformAdmin } from '../actions'

export default async function PlatformAdminsPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  const svc = createServiceClient()
  const { data: admins } = await svc.from('platform_admins').select('id, created_at').order('created_at')
  const { data: authData } = await svc.auth.admin.listUsers()
  const emailById: Record<string, string> = {}
  for (const u of authData?.users ?? []) emailById[u.id] = u.email ?? ''

  return (
    <>
      <div className="pt-page-hd" style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Platform admins</h1>
      </div>
      <div className="pt-card" style={{ marginBottom: 16 }}>
        <table className="pt-admin-table">
          <thead><tr><th>Email</th><th>Granted</th><th></th></tr></thead>
          <tbody>
            {(admins ?? []).map(a => (
              <tr key={a.id}>
                <td>{emailById[a.id] ?? a.id}</td>
                <td style={{ color: 'var(--pt-fg-3)' }}>{new Date(a.created_at).toLocaleDateString()}</td>
                <td>
                  {a.id !== user.id && (
                    <form action={revokePlatformAdmin.bind(null, a.id)} style={{ display: 'inline' }}>
                      <button type="submit" className="pt-btn"
                        style={{ fontSize: 11, height: 24, color: 'var(--pt-danger)' }}>
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pt-card" style={{ maxWidth: 400 }}>
        <div className="pt-card-hd"><h3>Grant access</h3></div>
        <div className="pt-card-body">
          <form action={grantPlatformAdmin} style={{ display: 'flex', gap: 8 }}>
            <input name="email" type="email" required placeholder="user@example.com"
              className="pt-input" style={{ flex: 1 }} />
            <button type="submit" className="pt-btn pt-btn-primary">Grant</button>
          </form>
        </div>
      </div>
    </>
  )
}
