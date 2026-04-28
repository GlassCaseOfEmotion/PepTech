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

const MOCK_CHANNELS = ['whatsapp', 'telegram']

export function DashboardLayout({ displayName, connectedChannels }: DashboardLayoutProps) {
  const [rightOpen, setRightOpen] = useState(true)
  const channels = connectedChannels.length > 0 ? connectedChannels : MOCK_CHANNELS

  return (
    <div className={`pt-root${rightOpen ? '' : ' no-right'}`}>
      <Sidebar displayName={displayName} />
      <main className="pt-main">
        <TopBar
          section="Dashboard"
          connectedChannels={channels}
          rightOpen={rightOpen}
          onRightToggle={() => setRightOpen(o => !o)}
        />
        <DashboardView />
      </main>
      {rightOpen && <DashboardRightRail focusThread={MOCK_THREADS[0]} />}
    </div>
  )
}
