'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icons } from '@/lib/icons'

interface BottomNavProps {
  unreadCount: number
}

const TABS = [
  { label: 'Dashboard', href: '/',          icon: Icons.spark  },
  { label: 'Inbox',     href: '/inbox',      icon: Icons.inbox  },
  { label: 'Customers', href: '/customers',  icon: Icons.users  },
  { label: 'Orders',    href: '/orders',     icon: Icons.box    },
]

const MORE_ITEMS = [
  { label: 'Catalog',     href: '/catalog',           icon: Icons.flask },
  { label: 'Broadcasts',  href: '/broadcasts',         icon: Icons.send  },
  { label: 'Automations', href: '/automations',        icon: Icons.zap   },
  { label: 'Vault',       href: '/vault',              icon: Icons.vault },
  { label: 'Settings',    href: '/settings/channels',  icon: Icons.gear  },
]

export function BottomNav({ unreadCount }: BottomNavProps) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      {moreOpen && (
        <div className="pt-bn-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="pt-bn-more-sheet" onClick={e => e.stopPropagation()}>
            <div className="pt-bn-more-handle" />
            {MORE_ITEMS.map(item => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="pt-bn-more-item"
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
      <nav className="pt-bottom-nav">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = isActive(tab.href)
          const isInbox = tab.href === '/inbox'
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`pt-bn-tab${active ? ' is-on' : ''}`}
            >
              <span className="pt-bn-icon">
                <Icon size={22} />
                {isInbox && unreadCount > 0 && (
                  <span className="pt-bn-badge" data-testid="unread-badge">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span className="pt-bn-label">{tab.label}</span>
            </Link>
          )
        })}
        <button
          className={`pt-bn-tab${moreOpen ? ' is-on' : ''}`}
          onClick={() => setMoreOpen(o => !o)}
        >
          <span className="pt-bn-icon"><Icons.more size={22} /></span>
          <span className="pt-bn-label">More</span>
        </button>
      </nav>
    </>
  )
}
