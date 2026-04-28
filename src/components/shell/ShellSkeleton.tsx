'use client'

import { Sidebar } from './Sidebar'

interface ShellSkeletonProps {
  section?: string
  isInbox?: boolean
}

export function ShellSkeleton({ section = '', isInbox = false }: ShellSkeletonProps) {
  return (
    <div className={`pt-root no-right${isInbox ? ' is-inbox' : ''}`}>
      <Sidebar displayName="••" />
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
