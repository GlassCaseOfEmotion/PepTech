import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerUser, createServiceClient } from '@/lib/supabase/server'

export default async function AdminPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const svc = createServiceClient()
  const [{ data: tenants }, { data: orders7d }] = await Promise.all([
    svc.from('tenants')
      .select('id, name, slug, plan, is_active, created_at, users(id), customers(id)')
      .order('created_at', { ascending: false }),
    svc.from('orders')
      .select('tenant_id, payment_amount')
      .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString()),
  ])

  const gmvByTenant: Record<string, number> = {}
  for (const o of orders7d ?? []) {
    gmvByTenant[o.tenant_id] = (gmvByTenant[o.tenant_id] ?? 0) + (o.payment_amount ?? 0)
  }

  const totalTenants = tenants?.length ?? 0
  const activeTenants = tenants?.filter(t => t.is_active).length ?? 0
  const totalGmv7d = Object.values(gmvByTenant).reduce((a, b) => a + b, 0)

  return (
    <>
      <div className="pt-page-hd" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Tenants</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--pt-fg-3)' }}>
            {totalTenants} total · {activeTenants} active
          </p>
        </div>
        <div className="pt-page-actions">
          <Link href="/admin/tenants/new" className="pt-btn pt-btn-primary">+ New tenant</Link>
        </div>
      </div>

      <div className="pt-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="pt-kpi">
          <div className="pt-kpi-lbl">Total tenants</div>
          <div className="pt-kpi-val-row"><span className="pt-kpi-val">{totalTenants}</span></div>
          <div className="pt-kpi-sub">{activeTenants} active</div>
        </div>
        <div className="pt-kpi">
          <div className="pt-kpi-lbl">Platform GMV · 7d</div>
          <div className="pt-kpi-val-row"><span className="pt-kpi-val">{totalGmv7d.toLocaleString()}</span></div>
          <div className="pt-kpi-sub">across all tenants</div>
        </div>
        <div className="pt-kpi">
          <div className="pt-kpi-lbl">Disabled tenants</div>
          <div className="pt-kpi-val-row">
            <span className="pt-kpi-val">{totalTenants - activeTenants}</span>
          </div>
        </div>
      </div>

      <div className="pt-card">
        <table className="pt-admin-table">
          <thead>
            <tr>
              <th>Tenant</th><th>Plan</th><th>Users</th>
              <th>Customers</th><th>GMV 7d</th><th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {(tenants ?? []).map(t => (
              <tr key={t.id}>
                <td>
                  <Link href={`/admin/tenants/${t.id}`}>{t.name}</Link>
                  <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 1 }}>{t.slug}</div>
                </td>
                <td>{t.plan}</td>
                <td>{(t.users as { id: string }[] | null)?.length ?? 0}</td>
                <td>{(t.customers as { id: string }[] | null)?.length ?? 0}</td>
                <td>{(gmvByTenant[t.id] ?? 0).toLocaleString()}</td>
                <td>
                  <span className={`pt-admin-status-pill ${t.is_active ? 'active' : 'disabled'}`}>
                    {t.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td style={{ color: 'var(--pt-fg-3)' }}>
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
