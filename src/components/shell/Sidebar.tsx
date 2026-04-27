'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icons } from '@/lib/icons'

const NAV_PRIMARY = [
  { label: 'Dashboard',   href: '/',             icon: Icons.spark },
  { label: 'Inbox',       href: '/inbox',         icon: Icons.inbox },
  { label: 'Customers',   href: '/customers',     icon: Icons.users },
  { label: 'Orders',      href: '/orders',        icon: Icons.box },
  { label: 'Catalog',     href: '/catalog',       icon: Icons.flask },
  { label: 'Broadcasts',  href: '/broadcasts',    icon: Icons.send },
  { label: 'Automations', href: '/automations',   icon: Icons.zap },
]

const NAV_SECONDARY = [
  { label: 'Vault',    href: '/vault',            icon: Icons.vault },
  { label: 'Settings', href: '/settings/channels',icon: Icons.gear },
]

interface SidebarProps {
  displayName: string
}

export function Sidebar({ displayName }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <aside className="pt-sidebar">
      <div className="pt-brand">
        <div className="pt-brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path d="M3 10.5 7 5.5h6l4 5-4 5H7l-4-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="10" cy="10.5" r="2" fill="currentColor"/>
          </svg>
        </div>
        <div className="pt-brand-name">Peptech<span>.</span></div>
      </div>

      <nav className="pt-nav">
        {NAV_PRIMARY.map((n) => {
          const Icon = n.icon
          const on = isActive(n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`pt-nav-item ${on ? 'is-on' : ''}`}
            >
              <Icon size={15} />
              <span className="pt-nav-label">{n.label}</span>
            </Link>
          )
        })}
        <div className="pt-nav-sep" />
        {NAV_SECONDARY.map((n) => {
          const Icon = n.icon
          const on = isActive(n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`pt-nav-item ${on ? 'is-on' : ''}`}
            >
              <Icon size={15} />
              <span className="pt-nav-label">{n.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="pt-side-foot">
        <div className="pt-me">
          <div className="pt-me-av">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="pt-me-info">
            <div className="pt-me-name">{displayName}</div>
            <div className="pt-me-status">
              <i className="pt-dot pt-dot-ok" /> online
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
