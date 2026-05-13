'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { DashboardView, DashboardRightRail } from '@/components/dashboard/DashboardView'
import type { InboxThread } from '@/types/inbox'
import type { CatalogProduct } from '@/types/catalog'
import type { DashboardStats } from '@/types/dashboard'

interface DashboardLayoutProps {
  displayName: string
  connectedChannels: string[]
  threads: InboxThread[]
  stockProducts: CatalogProduct[]
  stats: DashboardStats
  baseCurrency: string
}

const MOCK_CHANNELS = ['whatsapp', 'telegram']

export function DashboardLayout({ displayName, connectedChannels, threads, stockProducts, stats, baseCurrency }: DashboardLayoutProps) {
  const [rightOpen, setRightOpen] = useState(true)
  const channels = connectedChannels.length > 0 ? connectedChannels : MOCK_CHANNELS
  const focusThread = threads.find(t => t.status === 'needs_reply') ?? threads[0] ?? null

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
        <DashboardView threads={threads} stockProducts={stockProducts} stats={stats} baseCurrency={baseCurrency} />
      </main>
      {rightOpen && <DashboardRightRail focusThread={focusThread} baseCurrency={baseCurrency} />}
    </div>
  )
}
