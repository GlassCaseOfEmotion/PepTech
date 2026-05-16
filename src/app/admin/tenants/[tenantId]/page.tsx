import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getServerUser, createServiceClient } from '@/lib/supabase/server'
import { setTenantActive, deleteTenant } from '../../actions'

export default async function TenantDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  const { tenantId } = await params
  const svc = createServiceClient()

  const [{ data: tenant }, { data: users }, { data: orders }, { data: channels }] = await Promise.all([
    svc.from('tenants').select('id, name, slug, plan, is_active, created_at').eq('id', tenantId).single(),
    svc.from('users').select('id, display_name, email, role, created_at').eq('tenant_id', tenantId).order('created_at'),
    svc.from('orders')
      .select('id, ref_number, status, payment_amount, created_at, customers(display_name)')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
    svc.from('tenant_channels').select('channel_type, is_active').eq('tenant_id', tenantId),
  ])
  if (!tenant) notFound()

  return (
    <>
      <div className="pt-page-hd" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--pt-fg-3)', marginBottom: 4 }}>
            <Link href="/admin">Tenants</Link> / {tenant.name}
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{tenant.name}</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--pt-fg-3)' }}>
            {tenant.slug} · {tenant.plan} · since {new Date(tenant.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="pt-page-actions">
          <form action={setTenantActive.bind(null, tenant.id, !tenant.is_active)}>
            <button type="submit" className="pt-btn">
              {tenant.is_active ? 'Disable tenant' : 'Re-enable tenant'}
            </button>
          </form>
          <form action={deleteTenant.bind(null, tenant.id)}>
            <button type="submit" className="pt-btn"
              style={{ color: 'var(--pt-danger)', borderColor: 'var(--pt-danger)' }}>
              Delete tenant
            </button>
          </form>
        </div>
      </div>

      <div className="pt-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="pt-kpi">
          <div className="pt-kpi-lbl">Status</div>
          <div className="pt-kpi-val-row">
            <span className={`pt-admin-status-pill ${tenant.is_active ? 'active' : 'disabled'}`}>
              {tenant.is_active ? 'Active' : 'Disabled'}
            </span>
          </div>
        </div>
        <div className="pt-kpi">
          <div className="pt-kpi-lbl">Users</div>
          <div className="pt-kpi-val-row"><span className="pt-kpi-val">{users?.length ?? 0}</span></div>
        </div>
        <div className="pt-kpi">
          <div className="pt-kpi-lbl">Recent orders</div>
          <div className="pt-kpi-val-row"><span className="pt-kpi-val">{orders?.length ?? 0}</span></div>
          <div className="pt-kpi-sub">last 10</div>
        </div>
        <div className="pt-kpi">
          <div className="pt-kpi-lbl">Channels</div>
          <div className="pt-kpi-val-row">
            <span className="pt-kpi-val">{(channels ?? []).filter(c => c.is_active).length}</span>
          </div>
          <div className="pt-kpi-sub">of {channels?.length ?? 0} connected</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="pt-card">
          <div className="pt-card-hd"><h3>Users</h3></div>
          <div className="pt-card-body" style={{ padding: 0 }}>
            <table className="pt-admin-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>
                {(users ?? []).map(u => (
                  <tr key={u.id}>
                    <td>{u.display_name ?? '—'}</td>
                    <td style={{ color: 'var(--pt-fg-3)' }}>{u.email}</td>
                    <td>{u.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="pt-card">
          <div className="pt-card-hd"><h3>Recent orders</h3></div>
          <div className="pt-card-body" style={{ padding: 0 }}>
            <table className="pt-admin-table">
              <thead><tr><th>Ref</th><th>Customer</th><th>Status</th><th>Amount</th></tr></thead>
              <tbody>
                {(orders ?? []).map(o => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'var(--pt-mono)', fontSize: 11 }}>{o.ref_number}</td>
                    <td>{(o.customers as { display_name: string } | null)?.display_name ?? '—'}</td>
                    <td>{o.status}</td>
                    <td>{(o.payment_amount ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
