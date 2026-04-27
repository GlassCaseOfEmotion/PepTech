'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { DashboardView, DashboardRightRail } from '@/components/dashboard/DashboardView'
import { MOCK_THREADS } from '@/lib/mock-data'

interface DashboardLayoutProps {
  displayName: string
  connectedChannels: string[]
}

export function DashboardLayout({ displayName, connectedChannels }: DashboardLayoutProps) {
  const [rightOpen, setRightOpen] = useState(true)

  return (
    <div className={`pt-root${rightOpen ? '' : ' no-right'}`}>
      <Sidebar displayName={displayName} />
      <main className="pt-main">
        <TopBar
          section="Dashboard"
          connectedChannels={connectedChannels}
          rightOpen={rightOpen}
          onRightToggle={() => setRightOpen(o => !o)}
        />
        <DashboardView />
      </main>
      {rightOpen && <DashboardRightRail focusThread={MOCK_THREADS[0]} />}
    </div>
  )
}
