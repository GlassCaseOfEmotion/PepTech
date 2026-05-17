'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalNotifications } from './GlobalNotifications'
import { AgentPalette } from './AgentPalette'
import { CommandPalette } from './CommandPalette'
import { ComposeModal } from './ComposeModal'
import { WelcomeTour } from './WelcomeTour'
import { BottomNav } from './BottomNav'
import { DashboardView, DashboardRightRail } from '@/components/dashboard/DashboardView'
import type { InboxThread, DbConversation } from '@/types/inbox'
import type { CatalogProduct } from '@/types/catalog'
import type { DashboardStats } from '@/types/dashboard'
import type { ReorderSignal } from '@/lib/reorder-signals'
import type { ShipmentRow } from '@/types/orders'
import type { PackingOrder, ActivityItem } from '@/types/dashboard'

interface DashboardLayoutProps {
  displayName: string
  connectedChannels: string[]
  threads: InboxThread[]
  initialPinned: DbConversation[]
  stockProducts: CatalogProduct[]
  stats: DashboardStats
  reorderSignals: ReorderSignal[]
  baseCurrency: string
  shipments: ShipmentRow[]
  packingOrders: PackingOrder[]
  activityItems: ActivityItem[]
  onboardingStatus?: { hasProducts: boolean; hasChannel: boolean; hasPayment: boolean } | null
}

export function DashboardLayout({ displayName, connectedChannels, threads, initialPinned, stockProducts, stats, reorderSignals, baseCurrency, shipments, packingOrders, activityItems, onboardingStatus }: DashboardLayoutProps) {
  const [rightOpen, setRightOpen] = useState(true)
  const channels = connectedChannels
  const focusThread = threads.find(t => t.status === 'needs_reply') ?? threads[0] ?? null
  const unreadCount = threads.filter(t => t.unread > 0).length

  return (
    <div className={`pt-root${rightOpen ? '' : ' no-right'}`}>
      <GlobalNotifications />
      <AgentPalette />
      <CommandPalette />
      <ComposeModal />
      <WelcomeTour />
      <Sidebar displayName={displayName} initialPinned={initialPinned} />
      <main className="pt-main">
        <TopBar
          section="Dashboard"
          connectedChannels={channels}
          rightOpen={rightOpen}
          onRightToggle={() => setRightOpen(o => !o)}
        />
        <DashboardView threads={threads} stockProducts={stockProducts} stats={stats} reorderSignals={reorderSignals} baseCurrency={baseCurrency} displayName={displayName} shipments={shipments} packingOrders={packingOrders} activityItems={activityItems} onboardingStatus={onboardingStatus} connectedChannels={channels} />
      </main>
      {rightOpen && (
        <DashboardRightRail
          focusThread={focusThread}
          baseCurrency={baseCurrency}
          pendingOrders={stats.pendingOrders}
          needsReplyThreads={threads.filter(t => t.status === 'needs_reply').slice(0, 3)}
          reordersDueSoon={reorderSignals.filter(r => r.daysRemaining <= 3)}
          packingOrders={packingOrders}
          activityItems={activityItems}
        />
      )}
      <BottomNav unreadCount={unreadCount} />
    </div>
  )
}
