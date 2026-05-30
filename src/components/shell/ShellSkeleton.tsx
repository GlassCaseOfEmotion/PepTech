import { Sidebar } from './Sidebar'
import { getNavCollapsed } from '@/lib/nav-state'
import { getTenantBrand } from '@/lib/tenant-brand'

interface ShellSkeletonProps {
  section?: string
  isInbox?: boolean
}

/** Server component — reads the nav-collapse cookie AND the tenant brand so
 * the skeleton paints with the user's sidebar width AND the workspace logo
 * on the very first frame. No flash of the Peptech default while loading. */
export async function ShellSkeleton({ section = '', isInbox = false }: ShellSkeletonProps) {
  const [navCollapsed, { tenantName, tenantLogoUrl }] = await Promise.all([
    getNavCollapsed(),
    getTenantBrand(),
  ])
  return (
    <div className={`pt-root${navCollapsed ? ' pt-nav-collapsed' : ''} no-right${isInbox ? ' is-inbox' : ''}`}>
      <Sidebar
        displayName="••"
        tenantName={tenantName}
        tenantLogoUrl={tenantLogoUrl}
        initialCollapsed={navCollapsed}
      />
      <main className="pt-main">
        <header className="pt-top">
          <div className="pt-top-crumbs">
            <span className="pt-crumb-home">Workspace</span>
            <span className="pt-crumb-sep">/</span>
            <span className="pt-crumb-now">{section}</span>
          </div>
          <div className="pt-top-mid" />
          <div className="pt-top-actions" />
        </header>
        <div style={{ flex: 1, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="pt-skel" style={{ height: 28, width: 180, borderRadius: 6 }} />
          <div className="pt-skel" style={{ height: 16, width: 320, animationDelay: '0.1s' }} />
          <div className="pt-skel" style={{ flex: 1, marginTop: 12, animationDelay: '0.2s' }} />
        </div>
      </main>
    </div>
  )
}
