'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icons } from '@/lib/icons'

const NAV_PRIMARY = [
  { label: 'Dashboard',   href: '/',              icon: Icons.spark, badge: null },
  { label: 'Inbox',       href: '/inbox',          icon: Icons.inbox, badge: 7 },
  { label: 'Customers',   href: '/customers',      icon: Icons.users, badge: null },
  { label: 'Orders',      href: '/orders',         icon: Icons.box,   badge: 3 },
  { label: 'Catalog',     href: '/catalog',        icon: Icons.flask, badge: null },
  { label: 'Broadcasts',  href: '/broadcasts',     icon: Icons.send,  badge: null },
  { label: 'Automations', href: '/automations',    icon: Icons.zap,   badge: null },
]

const NAV_SECONDARY = [
  { label: 'Vault',    href: '/vault',             icon: Icons.vault, badge: null },
  { label: 'Settings', href: '/settings/channels', icon: Icons.gear,  badge: null },
]

const PINNED = [
  { name: 'K. (gymrat_84)', snip: 'paid usdt — confirming', channel: 'wa' as const, unread: 2 },
  { name: 'swolepriest',    snip: 'tirz back in stock?',    channel: 'tg' as const, unread: 3 },
]

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

interface SidebarProps {
  displayName: string
}

export function Sidebar({ displayName }: SidebarProps) {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

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
        <button className="pt-brand-menu" title="Workspace"><Icons.arrowDn size={12} /></button>
      </div>

      <button className="pt-compose">
        <Icons.plus size={13} />
        <span>New message</span>
        <kbd>C</kbd>
      </button>

      <button className="pt-search">
        <Icons.search size={13} />
        <span>Search…</span>
        <kbd>⌘K</kbd>
      </button>

      <nav className="pt-nav">
        {NAV_PRIMARY.map((n) => {
          const Icon = n.icon
          const on = isActive(n.href)
          return (
            <Link key={n.href} href={n.href} className={`pt-nav-item ${on ? 'is-on' : ''}`}>
              <Icon size={15} />
              <span className="pt-nav-label">{n.label}</span>
              {n.badge != null && <span className="pt-nav-badge">{n.badge}</span>}
            </Link>
          )
        })}

        <div className="pt-nav-sep" />
        <div className="pt-nav-section">Pinned threads</div>

        {PINNED.map((p) => {
          const ChIcon = CH_ICONS[p.channel]
          return (
            <Link key={p.name} href="/inbox" className="pt-pin">
              {ChIcon && <ChIcon size={11} />}
              <div className="pt-pin-body">
                <div className="pt-pin-name">{p.name}</div>
                <div className="pt-pin-snip">{p.snip}</div>
              </div>
              {p.unread > 0 && <span className="pt-pin-unread">{p.unread}</span>}
            </Link>
          )
        })}

        <div className="pt-nav-sep" />
        {NAV_SECONDARY.map((n) => {
          const Icon = n.icon
          const on = isActive(n.href)
          return (
            <Link key={n.href} href={n.href} className={`pt-nav-item ${on ? 'is-on' : ''}`}>
              <Icon size={15} />
              <span className="pt-nav-label">{n.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="pt-side-foot">
        <div className="pt-me">
          <div className="pt-me-av">{displayName.slice(0, 2).toUpperCase()}</div>
          <div className="pt-me-info">
            <div className="pt-me-name">{displayName}</div>
            <div className="pt-me-status"><i className="pt-dot pt-dot-ok" /> online</div>
          </div>
          <button className="pt-me-more"><Icons.more size={14} /></button>
        </div>
      </div>
    </aside>
  )
}
