'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { useNavCollapsed } from './useNavCollapsed'

// ─── Theme ───────────────────────────────────────────────────────────────────

const THEMES = ['', 'pt-th-dim', 'pt-th-dark'] as const
type Theme = (typeof THEMES)[number]

function useTheme() {
  const [theme, setThemeState] = useState<Theme>('')

  useEffect(() => {
    const stored = (localStorage.getItem('pt-theme') ?? '') as Theme
    applyTheme(stored)
    setThemeState(stored)
  }, [])

  function applyTheme(t: Theme) {
    const root = document.querySelector('.pt-root')
    if (!root) return
    root.classList.remove('pt-th-dim', 'pt-th-dark')
    if (t) root.classList.add(t)
  }

  function cycle() {
    setThemeState(prev => {
      const next = THEMES[(THEMES.indexOf(prev) + 1) % THEMES.length]
      applyTheme(next)
      localStorage.setItem('pt-theme', next)
      return next
    })
  }

  return { theme, cycle }
}

const NAV_PRIMARY = [
  { label: 'Dashboard',   href: '/',              icon: Icons.spark,  badge: null },
  { label: 'Inbox',       href: '/inbox',          icon: Icons.inbox,  badge: null },
  { label: 'Contacts',    href: '/contacts',       icon: Icons.users,  badge: null },
  { label: 'Orders',      href: '/orders',         icon: Icons.box,    badge: null },
  { label: 'Payments',    href: '/payments',       icon: Icons.wallet, badge: null },
  { label: 'Catalog',     href: '/catalog',        icon: Icons.flask,  badge: null },
  { label: 'Broadcasts',  href: '/broadcasts',     icon: Icons.send,   badge: null },
  { label: 'Automations', href: '/automations',    icon: Icons.zap,    badge: null },
]

const NAV_SECONDARY = [
  { label: 'Vault',    href: '/vault',             icon: Icons.vault,  badge: null },
  { label: 'Media',    href: '/media',             icon: Icons.photo,  badge: null },
  { label: 'Settings', href: '/settings/channels', icon: Icons.gear,   badge: null },
]

interface SidebarProps {
  displayName: string
  /** Optional — when present, the brand mark + name show the tenant's
   * workspace identity instead of the Peptech default. */
  tenantName?: string | null
  /** Public URL (logos bucket is public) — synchronous, server-rendered,
   * no client fetch. The browser caches the image at the HTTP layer. */
  tenantLogoUrl?: string | null
  /** Server-rendered nav-collapsed state from the cookie — passed in so the
   * useState initial matches SSR and there's no width-snap on hydrate. */
  initialCollapsed?: boolean
  queuedCount?: number
}

export function Sidebar({ displayName, tenantName = null, tenantLogoUrl = null, initialCollapsed = true, queuedCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const { theme, cycle } = useTheme()
  const { collapsed, toggle } = useNavCollapsed(initialCollapsed)

  // ⌘\ (or Ctrl+\) toggles the sidebar from anywhere — same shortcut Linear,
  // Notion, Vercel use, so users guess it. Discoverable replacement for the
  // tiny chevron we lose in the collapsed brand.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggle])

  // Workspace mark — tenant logo if uploaded, otherwise initials from the
  // tenant name, otherwise the Peptech default (unauthed / pre-data load).
  const initials = tenantName ? tenantName.trim().slice(0, 2).toUpperCase() : null
  const BrandMark = tenantLogoUrl ? (
    <div className="pt-brand-mark pt-brand-mark-logo" aria-hidden="true">
      <img src={tenantLogoUrl} alt="" />
    </div>
  ) : initials ? (
    <div className="pt-brand-mark pt-brand-mark-initials" aria-hidden="true">
      {initials}
    </div>
  ) : (
    <div className="pt-brand-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20">
        <path d="M3 10.5 7 5.5h6l4 5-4 5H7l-4-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <circle cx="10" cy="10.5" r="2" fill="currentColor"/>
      </svg>
    </div>
  )
  const brandLabel = tenantName ?? 'Peptech'

  return (
    <aside className="pt-sidebar">
      {collapsed ? (
        // Collapsed: the brand mark itself is the expand button — no cramped
        // chevron beside it. Whole 36×36 square is the hit area.
        <button
          className="pt-brand-toggle"
          onClick={toggle}
          title="Expand sidebar (⌘\)"
          aria-label="Expand sidebar"
        >
          {BrandMark}
        </button>
      ) : (
        <div className="pt-brand">
          {BrandMark}
          <div className="pt-brand-name">{brandLabel}<span>.</span></div>
          <button
            className="pt-nav-collapse-btn"
            title="Collapse sidebar (⌘\)"
            aria-label="Collapse sidebar"
            onClick={toggle}
          >
            <Icons.arrowL size={13} />
          </button>
        </div>
      )}

      <button className="pt-compose" onClick={() => window.dispatchEvent(new CustomEvent('pt:compose:open'))}>
        <Icons.plus size={13} />
        <span>New message</span>
        <kbd>C</kbd>
      </button>

      <button data-tour="search" className="pt-search" onClick={() => window.dispatchEvent(new CustomEvent('pt:palette:open'))}>
        <Icons.search size={13} />
        <span>Search…</span>
        <kbd>⌘K</kbd>
      </button>

      {collapsed && <div className="pt-nav-sep" />}

      <nav className="pt-nav">
        {NAV_PRIMARY.map((n) => {
          const Icon = n.icon
          const on = isActive(n.href)
          const badge = n.href === '/automations' && queuedCount > 0 ? queuedCount : null
          return (
            <Link key={n.href} href={n.href} title={n.label} className={`pt-nav-item ${on ? 'is-on' : ''}`} {...(n.href === '/inbox' ? { 'data-tour': 'inbox-link' } : {})}>
              <Icon size={16} solid={on} />
              <span className="pt-nav-label">{n.label}</span>
              {badge != null && <span className="pt-nav-badge">{badge}</span>}
            </Link>
          )
        })}

        <div className="pt-nav-sep" />
        {NAV_SECONDARY.map((n) => {
          const Icon = n.icon
          const on = isActive(n.href)
          return (
            <Link key={n.href} href={n.href} title={n.label} className={`pt-nav-item ${on ? 'is-on' : ''}`}>
              <Icon size={16} solid={on} />
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
          <button
            className="pt-me-more"
            title={theme === '' ? 'Switch to dim' : theme === 'pt-th-dim' ? 'Switch to dark' : 'Switch to light'}
            onClick={cycle}
          >
            {theme === 'pt-th-dark' ? <Icons.moon size={13} /> : <Icons.sun size={13} />}
          </button>
        </div>
      </div>
    </aside>
  )
}
