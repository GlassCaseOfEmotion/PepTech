'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { dbConversationToThread, type DbConversation } from '@/types/inbox'

const NAV_PRIMARY = [
  { label: 'Dashboard',   href: '/',              icon: Icons.spark, badge: null },
  { label: 'Inbox',       href: '/inbox',          icon: Icons.inbox, badge: null },
  { label: 'Customers',   href: '/customers',      icon: Icons.users, badge: null },
  { label: 'Orders',      href: '/orders',         icon: Icons.box,   badge: null },
  { label: 'Catalog',     href: '/catalog',        icon: Icons.flask, badge: null },
  { label: 'Broadcasts',  href: '/broadcasts',     icon: Icons.send,  badge: null },
  { label: 'Automations', href: '/automations',    icon: Icons.zap,   badge: null },
]

const NAV_SECONDARY = [
  { label: 'Vault',    href: '/vault',             icon: Icons.vault, badge: null },
  { label: 'Settings', href: '/settings/channels', icon: Icons.gear,  badge: null },
]

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

const PINNED_SELECT = `
  id, status, unread_count, last_message_at, last_message_snippet,
  channel_type, channel_identifier, is_pinned,
  customers (
    id, display_name, trust_score, ltv,
    customer_tags (tag),
    customer_channels (channel_type, display_handle, is_primary)
  )
`

interface SidebarProps {
  displayName: string
}

export function Sidebar({ displayName }: SidebarProps) {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const supabase = useMemo(() => createClient(), [])
  const [pinned, setPinned] = useState<ReturnType<typeof dbConversationToThread>[]>([])

  useEffect(() => {
    supabase
      .from('conversations')
      .select(PINNED_SELECT)
      .eq('is_pinned', true)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        if (data) setPinned(data.map(c => dbConversationToThread(c as unknown as DbConversation)))
      })
  }, [supabase])

  useEffect(() => {
    const channel = supabase
      .channel('sidebar:pinned')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
        const updated = payload.new as { id: string; is_pinned: boolean; last_message_snippet: string | null; unread_count: number }
        if (updated.is_pinned) {
          // fetch full row so we have customer data
          supabase
            .from('conversations')
            .select(PINNED_SELECT)
            .eq('id', updated.id)
            .single()
            .then(({ data }) => {
              if (!data) return
              const thread = dbConversationToThread(data as unknown as DbConversation)
              setPinned(prev => {
                if (prev.some(p => p.id === thread.id)) {
                  return prev.map(p => p.id === thread.id ? thread : p)
                }
                return [thread, ...prev]
              })
            })
        } else {
          setPinned(prev => prev.filter(p => p.id !== updated.id))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

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

        {pinned.length > 0 && (
          <>
            <div className="pt-nav-sep" />
            <div className="pt-nav-section">Pinned threads</div>
            {pinned.map((p) => {
              const ChIcon = CH_ICONS[p.channel]
              return (
                <Link key={p.id} href={`/inbox?conversation=${p.id}`} className="pt-pin">
                  {ChIcon && <ChIcon size={11} />}
                  <div className="pt-pin-body">
                    <div className="pt-pin-name">{p.name}</div>
                    <div className="pt-pin-snip">{p.snippet}</div>
                  </div>
                  {p.unread > 0 && <span className="pt-pin-unread">{p.unread}</span>}
                </Link>
              )
            })}
          </>
        )}

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
