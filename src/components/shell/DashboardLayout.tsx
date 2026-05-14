'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalNotifications } from './GlobalNotifications'
import { AgentPalette } from './AgentPalette'
import { DashboardView, DashboardRightRail } from '@/components/dashboard/DashboardView'
import type { InboxThread, DbConversation } from '@/types/inbox'
import type { CatalogProduct } from '@/types/catalog'
import type { DashboardStats } from '@/types/dashboard'
import type { ReorderSignal } from '@/lib/reorder-signals'

interface DashboardLayoutProps {
  displayName: string
  connectedChannels: string[]
  threads: InboxThread[]
  initialPinned: DbConversation[]
  stockProducts: CatalogProduct[]
  stats: DashboardStats
  reorderSignals: ReorderSignal[]
  baseCurrency: string
}

const MOCK_CHANNELS = ['whatsapp', 'telegram']

export function DashboardLayout({ displayName, connectedChannels, threads, initialPinned, stockProducts, stats, reorderSignals, baseCurrency }: DashboardLayoutProps) {
  const [rightOpen, setRightOpen] = useState(true)
  const channels = connectedChannels.length > 0 ? connectedChannels : MOCK_CHANNELS
  const focusThread = threads.find(t => t.status === 'needs_reply') ?? threads[0] ?? null

  return (
    <div className={`pt-root${rightOpen ? '' : ' no-right'}`}>
      <GlobalNotifications />
      <AgentPalette />
      <Sidebar displayName={displayName} initialPinned={initialPinned} />
      <main className="pt-main">
        <TopBar
          section="Dashboard"
          connectedChannels={channels}
          rightOpen={rightOpen}
          onRightToggle={() => setRightOpen(o => !o)}
        />
        <DashboardView threads={threads} stockProducts={stockProducts} stats={stats} reorderSignals={reorderSignals} baseCurrency={baseCurrency} displayName={displayName} />
      </main>
      {rightOpen && <DashboardRightRail focusThread={focusThread} baseCurrency={baseCurrency} />}
    </div>
  )
}
