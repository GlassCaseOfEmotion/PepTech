'use client'

import { useState } from 'react'

type Tab = 'cycles' | 'activity' | 'orders' | 'notes' | 'automations'

interface CustomerDetailBodyProps {
  cycles: React.ReactNode
  activity: React.ReactNode
  orders: React.ReactNode
  notes: React.ReactNode
  trust?: React.ReactNode
  details?: React.ReactNode
  automations?: React.ReactNode
}

export function CustomerDetailBody({ cycles, activity, orders, notes, trust, details, automations }: CustomerDetailBodyProps) {
  const [tab, setTab] = useState<Tab>('cycles')

  const TABS: { id: Tab; label: string }[] = [
    { id: 'cycles',      label: 'Cycles'      },
    { id: 'activity',    label: 'Activity'    },
    { id: 'orders',      label: 'Orders'      },
    { id: 'notes',       label: 'Notes'       },
    { id: 'automations', label: 'Automations' },
  ]

  return (
    <>
      {/* Mobile tab bar — hidden on desktop via CSS */}
      <div className="pt-cd-tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`pt-cd-tab${tab === t.id ? ' is-on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* pt-cu-grid is the existing 2-col card grid class in customer.css */}
      <div className="pt-cu-grid">
        <div className="pt-cu-col">
          <div className={`pt-cd-section${tab === 'orders' ? ' is-active' : ''}`} data-section="orders">
            {orders}
          </div>
          <div className={`pt-cd-section${tab === 'cycles' ? ' is-active' : ''}`} data-section="cycles">
            {cycles}
          </div>
          <div className={`pt-cd-section${tab === 'notes' ? ' is-active' : ''}`} data-section="notes">
            {notes}
          </div>
        </div>
        <div className="pt-cu-col">
          {trust && (
            <div className="pt-cd-section pt-cd-desktop-only" data-section="trust">
              {trust}
            </div>
          )}
          {automations && (
            <div className={`pt-cd-section${tab === 'automations' ? ' is-active' : ''}`} data-section="automations">
              {automations}
            </div>
          )}
          {details && (
            <div className="pt-cd-section pt-cd-desktop-only" data-section="details">
              {details}
            </div>
          )}
          <div className={`pt-cd-section${tab === 'activity' ? ' is-active' : ''}`} data-section="activity">
            {activity}
          </div>
        </div>
      </div>
    </>
  )
}
