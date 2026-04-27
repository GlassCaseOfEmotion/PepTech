# Phase 2B — Inbox UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Inbox UI — app shell (sidebar + topbar), three-column inbox (thread list, conversation pane, composer, customer rail), real-time updates via Supabase subscriptions, and a customer profile page.

**Architecture:** Server Components fetch initial data (conversations list, messages, customer) and hand it to Client Components which own interactivity and real-time. The Shell (Sidebar + TopBar) is a Server Component that passes user info as props to its Client sub-components. Real-time uses the Supabase browser client in `useEffect` hooks — two channels: one for the conversations list, one filtered to the active conversation's messages. URL routing follows `/inbox` (no active thread) and `/inbox/{conversationId}` (active thread); switching threads updates the URL with `router.push`.

**Tech Stack:** Next.js 15 App Router, React (useState/useEffect/useRef), @supabase/supabase-js browser client (real-time), peptech.css design system (pt-* classes), Vitest + React Testing Library

---

## Design reference

All visual output must match `Claude Design Files/project/` prototypes. CSS classes come from `styles/peptech.css` — no Tailwind, no additional CSS files. Icon SVG paths are defined in Task 1.

---

## File Map

```
src/
├── lib/
│   └── icons.tsx                              ← icon components (from design icons.jsx)
├── types/
│   └── inbox.ts                               ← ConversationWithCustomer, MessageRow
├── components/
│   ├── shell/
│   │   ├── Shell.tsx                          ← Server Component: fetches user, renders sidebar+topbar+main
│   │   ├── Sidebar.tsx                        ← Client Component: nav, active state via usePathname
│   │   └── TopBar.tsx                         ← Client Component: breadcrumbs, channel chips, actions
│   └── inbox/
│       ├── InboxView.tsx                      ← Client Component: all state + real-time + routing
│       ├── ThreadList.tsx                     ← thread column: search, filters, thread rows
│       ├── ThreadRow.tsx                      ← single conversation row
│       ├── ConversationPane.tsx               ← center column: header + message stream
│       ├── MessageBubble.tsx                  ← single message bubble
│       ├── Composer.tsx                       ← textarea + quick replies + send button
│       └── CustomerRail.tsx                   ← right rail: customer card + notes + activity
└── app/
    ├── inbox/
    │   ├── page.tsx                           ← Server Component (no active conv)
    │   └── [conversationId]/
    │       └── page.tsx                       ← Server Component (active conv)
    └── customers/
        └── [customerId]/
            └── page.tsx                       ← customer profile page
```

---

## Task 1: Icons + shared types

**Files:**
- Create: `src/lib/icons.tsx`
- Create: `src/types/inbox.ts`

- [ ] **Step 1: Create icon components**

Create `src/lib/icons.tsx`:

```typescript
import React from 'react'

interface IconProps {
  size?: number
  className?: string
}

function PtIcon({ d, size = 14, children, className }: { d?: string; size?: number; children?: React.ReactNode; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }} className={className}
    >
      {d ? <path d={d} /> : children}
    </svg>
  )
}

export const Icons = {
  inbox:   (p: IconProps) => <PtIcon {...p} d="M22 12h-6l-2 3h-4l-2-3H2 M5.5 5.5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" />,
  users:   (p: IconProps) => <PtIcon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M22 20a6.5 6.5 0 0 0-5-6.3"/></PtIcon>,
  box:     (p: IconProps) => <PtIcon {...p} d="M3.3 7.5 12 3l8.7 4.5v9L12 21l-8.7-4.5v-9Z M3.3 7.5 12 12l8.7-4.5 M12 12v9" />,
  flask:   (p: IconProps) => <PtIcon {...p} d="M9 3h6 M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3 M7 15h10" />,
  send:    (p: IconProps) => <PtIcon {...p} d="M22 3 11 14 M22 3l-7 18-4-7-7-4 18-7Z" />,
  zap:     (p: IconProps) => <PtIcon {...p} d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  vault:   (p: IconProps) => <PtIcon {...p}><rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="13" cy="12" r="3"/><path d="M13 9v-1 M13 16v-1 M16 12h1 M9 12h1"/></PtIcon>,
  search:  (p: IconProps) => <PtIcon {...p}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/></PtIcon>,
  bell:    (p: IconProps) => <PtIcon {...p} d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6 M10 19a2 2 0 0 0 4 0" />,
  plus:    (p: IconProps) => <PtIcon {...p} d="M12 5v14 M5 12h14" />,
  arrowDn: (p: IconProps) => <PtIcon {...p} d="M7 10l5 5 5-5" />,
  arrowL:  (p: IconProps) => <PtIcon {...p} d="M15 6l-6 6 6 6" />,
  check:   (p: IconProps) => <PtIcon {...p} d="M5 12.5 10 17 19 7" />,
  more:    (p: IconProps) => <PtIcon {...p}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></PtIcon>,
  filter:  (p: IconProps) => <PtIcon {...p} d="M3 5h18l-7 9v6l-4-2v-4L3 5Z" />,
  clock:   (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></PtIcon>,
  spark:   (p: IconProps) => <PtIcon {...p} d="M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1" />,
  gear:    (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></PtIcon>,
  user:    (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></PtIcon>,
  // Channel icons (filled circles with letterforms)
  wa:      (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M8 8.5c0-.5.4-.9 1-.9h.6c.4 0 .8.3.9.7l.4 1.4c.1.4 0 .8-.3 1l-.6.5c.7 1.4 1.8 2.5 3.2 3.2l.5-.6c.2-.3.6-.4 1-.3l1.4.4c.4.1.7.5.7.9V15c0 .6-.4 1-.9 1A7.5 7.5 0 0 1 8 8.5Z" stroke="white" fill="none"/></PtIcon>,
  tg:      (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M7 12.5 17 8.5l-1.5 8L12 14l-1 2.5L9.5 13Z" fill="white" stroke="white"/></PtIcon>,
  em:      (p: IconProps) => <PtIcon {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="m4 8 8 6 8-6"/></PtIcon>,
}

export function ChannelIcon({ channelType, size = 9 }: { channelType: string; size?: number }) {
  if (channelType === 'whatsapp') return <Icons.wa size={size} />
  if (channelType === 'telegram') return <Icons.tg size={size} />
  return <Icons.em size={size} />
}
```

- [ ] **Step 2: Create inbox types**

Create `src/types/inbox.ts`:

```typescript
export type ConversationWithCustomer = {
  id: string
  status: string
  unread_count: number
  last_message_at: string | null
  last_message_snippet: string | null
  channel_type: string
  channel_identifier: string
  customers: {
    id: string
    display_name: string
    trust_score: number
    ltv: number
    customer_tags: { tag: string }[]
  } | null
}

export type MessageRow = {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  sent_at: string
  status: string
}

export function initials(name: string): string {
  const upper = name.match(/[A-Z]/g)
  if (upper && upper.length >= 2) return upper.slice(0, 2).join('')
  return name.slice(0, 2).toUpperCase()
}

export function fmtTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m`
  if (diffMins < 60 * 24) return `${Math.floor(diffMins / 60)}h`
  return `${Math.floor(diffMins / 1440)}d`
}
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
npm run test:run
```

Expected: 22/22 pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/icons.tsx src/types/inbox.ts
git commit -m "feat: add icon components and inbox types"
```

---

## Task 2: Shell — Sidebar + TopBar + Shell wrapper

**Files:**
- Create: `src/components/shell/Sidebar.tsx`
- Create: `src/components/shell/TopBar.tsx`
- Create: `src/components/shell/Shell.tsx`
- Create: `src/components/shell/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/shell/__tests__/Sidebar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/inbox'),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { Sidebar } from '../Sidebar'

describe('Sidebar', () => {
  it('renders all primary nav items', () => {
    render(<Sidebar displayName="dr_peptide" />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('marks inbox nav item as active when on /inbox', () => {
    render(<Sidebar displayName="dr_peptide" />)
    const inboxBtn = screen.getByText('Inbox').closest('a')
    expect(inboxBtn).toHaveClass('is-on')
  })

  it('renders user display name', () => {
    render(<Sidebar displayName="dr_peptide" />)
    expect(screen.getByText('dr_peptide')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/components/shell/__tests__/Sidebar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create Sidebar**

Create `src/components/shell/Sidebar.tsx`:

```typescript
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
```

- [ ] **Step 4: Create TopBar**

Create `src/components/shell/TopBar.tsx`:

```typescript
'use client'

import { Icons } from '@/lib/icons'

interface TopBarProps {
  section?: string
  connectedChannels?: string[]
}

export function TopBar({ section = 'Inbox', connectedChannels = [] }: TopBarProps) {
  return (
    <header className="pt-top">
      <div className="pt-top-crumbs">
        <span className="pt-crumb-home">Workspace</span>
        <span className="pt-crumb-sep">/</span>
        <span className="pt-crumb-now">{section}</span>
      </div>

      <div className="pt-top-mid">
        {connectedChannels.includes('whatsapp') && (
          <div className="pt-chip pt-chip-wa">
            <Icons.wa size={12} />
            <span>WhatsApp</span>
            <i className="pt-chip-dot" />
          </div>
        )}
        {connectedChannels.includes('telegram') && (
          <div className="pt-chip pt-chip-tg">
            <Icons.tg size={12} />
            <span>Telegram</span>
            <i className="pt-chip-dot" />
          </div>
        )}
        {connectedChannels.includes('email') && (
          <div className="pt-chip pt-chip-em">
            <Icons.em size={12} />
            <span>Email</span>
            <i className="pt-chip-dot" />
          </div>
        )}
      </div>

      <div className="pt-top-actions">
        <button className="pt-iconbtn" title="Notifications">
          <Icons.bell size={14} />
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 5: Create Shell (Server Component)**

Create `src/components/shell/Shell.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

interface ShellProps {
  children: React.ReactNode
  section?: string
  isInbox?: boolean
}

export async function Shell({ children, section, isInbox = false }: ShellProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get display name
  let displayName = 'User'
  if (user) {
    const { data: userRow } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single()
    displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'
  }

  // Get connected channels for topbar chips
  let connectedChannels: string[] = []
  if (user) {
    const { data: userRow } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (userRow) {
      const { data: channels } = await supabase
        .from('tenant_channels')
        .select('channel_type')
        .eq('tenant_id', userRow.tenant_id)
        .eq('is_active', true)
      connectedChannels = (channels ?? []).map((c) => c.channel_type)
    }
  }

  const rootClass = `pt-root no-right${isInbox ? ' is-inbox' : ''}`

  return (
    <div className={rootClass}>
      <Sidebar displayName={displayName} />
      <main className="pt-main">
        <TopBar section={section} connectedChannels={connectedChannels} />
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
npm run test:run -- src/components/shell/__tests__/Sidebar.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 7: Run full suite**

```bash
npm run test:run
```

Expected: 25/25 pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/shell/
git commit -m "feat: add Shell, Sidebar, and TopBar components"
```

---

## Task 3: ThreadRow

**Files:**
- Create: `src/components/inbox/ThreadRow.tsx`
- Create: `src/components/inbox/__tests__/ThreadRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/inbox/__tests__/ThreadRow.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ThreadRow } from '../ThreadRow'
import type { ConversationWithCustomer } from '@/types/inbox'

const BASE_CONV: ConversationWithCustomer = {
  id: 'c1',
  status: 'needs_reply',
  unread_count: 3,
  last_message_at: new Date(Date.now() - 5 * 60000).toISOString(),
  last_message_snippet: 'yo 2 vials reta',
  channel_type: 'telegram',
  channel_identifier: '99887766',
  customers: {
    id: 'cust-1',
    display_name: 'gymrat_84',
    trust_score: 88,
    ltv: 2840,
    customer_tags: [{ tag: 'vip' }, { tag: 'repeat' }],
  },
}

describe('ThreadRow', () => {
  it('renders customer display name and snippet', () => {
    render(<ThreadRow conv={BASE_CONV} active={false} onClick={vi.fn()} />)
    expect(screen.getByText('gymrat_84')).toBeInTheDocument()
    expect(screen.getByText('yo 2 vials reta')).toBeInTheDocument()
  })

  it('shows unread badge when unread_count > 0', () => {
    render(<ThreadRow conv={BASE_CONV} active={false} onClick={vi.fn()} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows trust score when no unread messages', () => {
    const conv = { ...BASE_CONV, unread_count: 0 }
    render(<ThreadRow conv={conv} active={false} onClick={vi.fn()} />)
    expect(screen.getByText('88')).toBeInTheDocument()
  })

  it('applies is-active class when active', () => {
    const { container } = render(<ThreadRow conv={BASE_CONV} active={true} onClick={vi.fn()} />)
    expect(container.querySelector('.pt-ixt')).toHaveClass('is-active')
  })

  it('shows VIP tag', () => {
    render(<ThreadRow conv={BASE_CONV} active={false} onClick={vi.fn()} />)
    expect(screen.getByText('VIP')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<ThreadRow conv={BASE_CONV} active={false} onClick={onClick} />)
    fireEvent.click(screen.getByText('gymrat_84'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/components/inbox/__tests__/ThreadRow.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create ThreadRow**

Create `src/components/inbox/ThreadRow.tsx`:

```typescript
import { ChannelIcon, Icons } from '@/lib/icons'
import { initials, fmtTime } from '@/types/inbox'
import type { ConversationWithCustomer } from '@/types/inbox'

interface ThreadRowProps {
  conv: ConversationWithCustomer
  active: boolean
  onClick: () => void
}

export function ThreadRow({ conv, active, onClick }: ThreadRowProps) {
  const customer = conv.customers
  const tags = customer?.customer_tags?.map((t) => t.tag) ?? []
  const name = customer?.display_name ?? conv.channel_identifier
  const hasUnread = conv.unread_count > 0

  return (
    <li
      className={`pt-ixt ${active ? 'is-active' : ''} ${hasUnread ? 'is-unread' : ''}`}
      onClick={onClick}
    >
      <div className="pt-ixt-av" data-channel={conv.channel_type}>
        <span>{initials(name)}</span>
        <i className={`pt-thread-ch pt-ch-${conv.channel_type}`}>
          <ChannelIcon channelType={conv.channel_type} size={9} />
        </i>
      </div>
      <div className="pt-ixt-mid">
        <div className="pt-ixt-row1">
          <span className="pt-ixt-name">{name}</span>
          <span className="pt-ixt-time mono">{fmtTime(conv.last_message_at)}</span>
        </div>
        <div className="pt-ixt-row2">
          <span className="pt-ixt-snip">{conv.last_message_snippet ?? ''}</span>
          {hasUnread && (
            <span className="pt-thread-unread">{conv.unread_count}</span>
          )}
        </div>
        <div className="pt-ixt-row3">
          {tags.includes('vip') && <span className="pt-tag pt-tag-vip">VIP</span>}
          {tags.includes('new') && <span className="pt-tag pt-tag-new">new</span>}
          {tags.includes('waitlist') && <span className="pt-tag">waitlist</span>}
          {tags.includes('payment') && <span className="pt-tag pt-tag-warn">payment</span>}
          {tags.includes('repeat') && !tags.includes('vip') && (
            <span className="pt-tag pt-tag-soft">repeat</span>
          )}
          {!hasUnread && customer && (
            <span className="pt-ixt-trust mono">trust {customer.trust_score}</span>
          )}
        </div>
      </div>
    </li>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/components/inbox/__tests__/ThreadRow.test.tsx
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/ThreadRow.tsx src/components/inbox/__tests__/ThreadRow.test.tsx
git commit -m "feat: add ThreadRow component"
```

---

## Task 4: ThreadList

**Files:**
- Create: `src/components/inbox/ThreadList.tsx`
- Create: `src/components/inbox/__tests__/ThreadList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/inbox/__tests__/ThreadList.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ThreadList } from '../ThreadList'
import type { ConversationWithCustomer } from '@/types/inbox'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/inbox'),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a>,
}))

function makeConv(id: string, status: string): ConversationWithCustomer {
  return {
    id, status, unread_count: 0,
    last_message_at: null, last_message_snippet: 'msg',
    channel_type: 'telegram', channel_identifier: '123',
    customers: { id: `cust-${id}`, display_name: `Customer ${id}`, trust_score: 80, ltv: 100, customer_tags: [] },
  }
}

describe('ThreadList', () => {
  const convs = [makeConv('c1', 'needs_reply'), makeConv('c2', 'new'), makeConv('c3', 'snoozed')]

  it('shows all conversations by default', () => {
    render(<ThreadList conversations={convs} activeId={null} onSelect={vi.fn()} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('filters to needs_reply when pill clicked', () => {
    render(<ThreadList conversations={convs} activeId={null} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByText('Needs reply'))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('calls onSelect when thread is clicked', () => {
    const onSelect = vi.fn()
    render(<ThreadList conversations={convs} activeId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Customer c1'))
    expect(onSelect).toHaveBeenCalledWith('c1')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/components/inbox/__tests__/ThreadList.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create ThreadList**

Create `src/components/inbox/ThreadList.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Icons } from '@/lib/icons'
import { ThreadRow } from './ThreadRow'
import type { ConversationWithCustomer } from '@/types/inbox'

interface ThreadListProps {
  conversations: ConversationWithCustomer[]
  activeId: string | null
  onSelect: (id: string) => void
}

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'needs_reply', label: 'Needs reply' },
  { id: 'new',         label: 'New' },
  { id: 'snoozed',     label: 'Snoozed' },
] as const

export function ThreadList({ conversations, activeId, onSelect }: ThreadListProps) {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filtered = conversations.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = c.customers?.display_name?.toLowerCase() ?? ''
      const snippet = c.last_message_snippet?.toLowerCase() ?? ''
      if (!name.includes(q) && !snippet.includes(q)) return false
    }
    return true
  })

  return (
    <div className="pt-ix-list">
      <div className="pt-ix-list-hd">
        <span className="pt-ix-list-title">Inbox</span>
        <button className="pt-iconbtn" title="Filter"><Icons.filter size={13} /></button>
        <button className="pt-iconbtn" title="Compose"><Icons.plus size={13} /></button>
      </div>

      <div className="pt-ix-search">
        <Icons.search size={12} />
        <input
          placeholder="Search threads…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="pt-ix-filters">
        {FILTERS.map((f) => {
          const count = f.id === 'all'
            ? conversations.length
            : conversations.filter((c) => c.status === f.id).length
          return (
            <button
              key={f.id}
              className={`pt-pill ${filter === f.id ? 'is-on' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="pt-pill-num">{count}</span>
            </button>
          )
        })}
      </div>

      <ul className="pt-ix-threads">
        {filtered.map((c) => (
          <ThreadRow
            key={c.id}
            conv={c}
            active={c.id === activeId}
            onClick={() => onSelect(c.id)}
          />
        ))}
        {filtered.length === 0 && (
          <li style={{ padding: '24px 12px', color: 'var(--pt-fg-4)', fontSize: 12, textAlign: 'center' }}>
            No threads
          </li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/components/inbox/__tests__/ThreadList.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: 31/31 pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/inbox/ThreadList.tsx src/components/inbox/__tests__/ThreadList.test.tsx
git commit -m "feat: add ThreadList component with search + filter pills"
```

---

## Task 5: MessageBubble

**Files:**
- Create: `src/components/inbox/MessageBubble.tsx`
- Create: `src/components/inbox/__tests__/MessageBubble.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/inbox/__tests__/MessageBubble.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MessageBubble } from '../MessageBubble'
import type { MessageRow } from '@/types/inbox'

function makeMsg(direction: 'inbound' | 'outbound', status = 'delivered'): MessageRow {
  return { id: 'm1', direction, content: 'Hello world', sent_at: new Date().toISOString(), status }
}

describe('MessageBubble', () => {
  it('renders message content', () => {
    render(<MessageBubble message={makeMsg('inbound')} channelType="telegram" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('applies pt-bubble-them class for inbound messages', () => {
    const { container } = render(<MessageBubble message={makeMsg('inbound')} channelType="telegram" />)
    expect(container.querySelector('.pt-bubble-them')).toBeInTheDocument()
  })

  it('applies pt-bubble-me class for outbound messages', () => {
    const { container } = render(<MessageBubble message={makeMsg('outbound')} channelType="telegram" />)
    expect(container.querySelector('.pt-bubble-me')).toBeInTheDocument()
  })

  it('shows sending indicator for sending status', () => {
    render(<MessageBubble message={makeMsg('outbound', 'sending')} channelType="whatsapp" />)
    expect(screen.getByText(/sending/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/components/inbox/__tests__/MessageBubble.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create MessageBubble**

Create `src/components/inbox/MessageBubble.tsx`:

```typescript
import type { MessageRow } from '@/types/inbox'
import { fmtTime } from '@/types/inbox'

interface MessageBubbleProps {
  message: MessageRow
  channelType: string
}

export function MessageBubble({ message, channelType }: MessageBubbleProps) {
  const isMe = message.direction === 'outbound'
  const isSending = message.status === 'sending'

  return (
    <div className={`pt-bubble ${isMe ? 'pt-bubble-me' : 'pt-bubble-them'} ${isSending ? 'is-optimistic' : ''}`}>
      <div className="pt-bubble-text">{message.content}</div>
      <div className="pt-bubble-meta">
        {fmtTime(message.sent_at)}
        {isSending && <span className="pt-bubble-pending"> · sending…</span>}
        {isMe && !isSending && message.status === 'read' && (
          <span className="pt-bubble-read"> · read</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/components/inbox/__tests__/MessageBubble.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/MessageBubble.tsx src/components/inbox/__tests__/MessageBubble.test.tsx
git commit -m "feat: add MessageBubble component"
```

---

## Task 6: Composer

**Files:**
- Create: `src/components/inbox/Composer.tsx`
- Create: `src/components/inbox/__tests__/Composer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/inbox/__tests__/Composer.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Composer } from '../Composer'

describe('Composer', () => {
  it('send button is disabled when textarea is empty', () => {
    render(<Composer onSend={vi.fn()} channelType="telegram" customerName="Alice" quickReplies={[]} />)
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('send button is enabled when there is text', async () => {
    const user = userEvent.setup()
    render(<Composer onSend={vi.fn()} channelType="telegram" customerName="Alice" quickReplies={[]} />)
    await user.type(screen.getByRole('textbox'), 'hello')
    expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled()
  })

  it('calls onSend with text and clears textarea on submit', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Composer onSend={onSend} channelType="telegram" customerName="Alice" quickReplies={[]} />)
    const ta = screen.getByRole('textbox')
    await user.type(ta, 'hello')
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('hello')
    expect(ta).toHaveValue('')
  })

  it('inserts quick reply text on chip click', async () => {
    const user = userEvent.setup()
    render(
      <Composer
        onSend={vi.fn()}
        channelType="telegram"
        customerName="Alice"
        quickReplies={[{ id: 'q1', label: 'send wallet addr', content: 'USDT: addr123', sort_order: 0 }]}
      />
    )
    await user.click(screen.getByText('send wallet addr'))
    expect(screen.getByRole('textbox')).toHaveValue('USDT: addr123')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/components/inbox/__tests__/Composer.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create Composer**

Create `src/components/inbox/Composer.tsx`:

```typescript
'use client'

import { useState, useRef, useCallback } from 'react'
import { Icons } from '@/lib/icons'

export interface QuickReply {
  id: string
  label: string
  content: string
  sort_order: number
}

interface ComposerProps {
  onSend: (content: string) => void
  channelType: string
  customerName: string
  quickReplies: QuickReply[]
}

export function Composer({ onSend, channelType, customerName, quickReplies }: ComposerProps) {
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  const channelLabel = channelType === 'whatsapp' ? 'WhatsApp'
    : channelType === 'telegram' ? 'Telegram'
    : 'Email'

  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }, [draft, onSend])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const insertQuickReply = (content: string) => {
    setDraft((d) => d ? `${d}\n\n${content}` : content)
    setTimeout(() => taRef.current?.focus(), 0)
  }

  return (
    <div className="pt-ix-composer">
      {quickReplies.length > 0 && (
        <div className="pt-quicks pt-quicks-bar">
          <span className="pt-quicks-lbl">Quick</span>
          {quickReplies.slice(0, 5).map((q) => (
            <button key={q.id} className="pt-quick" onClick={() => insertQuickReply(q.content)}>
              {q.label}
            </button>
          ))}
        </div>
      )}
      <div className="pt-composer-field">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${customerName} via ${channelLabel}…`}
          rows={3}
        />
        <div className="pt-composer-tools">
          <div className="pt-composer-l">
            <span className="pt-composer-hint">⌘↵ to send</span>
          </div>
          <div className="pt-composer-r">
            <button
              className="pt-btn pt-btn-primary"
              onClick={handleSend}
              disabled={!draft.trim()}
              aria-label="Send"
            >
              <Icons.send size={12} /> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/components/inbox/__tests__/Composer.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: 39/39 pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/inbox/Composer.tsx src/components/inbox/__tests__/Composer.test.tsx
git commit -m "feat: add Composer component with quick replies"
```

---

## Task 7: ConversationPane

**Files:**
- Create: `src/components/inbox/ConversationPane.tsx`
- Create: `src/components/inbox/__tests__/ConversationPane.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/inbox/__tests__/ConversationPane.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConversationPane } from '../ConversationPane'
import type { ConversationWithCustomer, MessageRow } from '@/types/inbox'

const CONV: ConversationWithCustomer = {
  id: 'c1', status: 'needs_reply', unread_count: 2,
  last_message_at: null, last_message_snippet: null,
  channel_type: 'telegram', channel_identifier: '99887766',
  customers: { id: 'cust-1', display_name: 'gymrat_84', trust_score: 88, ltv: 2840, customer_tags: [] },
}

const MESSAGES: MessageRow[] = [
  { id: 'm1', direction: 'inbound', content: 'need tirz', sent_at: new Date().toISOString(), status: 'delivered' },
  { id: 'm2', direction: 'outbound', content: 'in stock!', sent_at: new Date().toISOString(), status: 'sent' },
]

describe('ConversationPane', () => {
  it('renders customer name in header', () => {
    render(<ConversationPane conversation={CONV} messages={MESSAGES} onSend={vi.fn()} quickReplies={[]} />)
    expect(screen.getByText('gymrat_84')).toBeInTheDocument()
  })

  it('renders all messages', () => {
    render(<ConversationPane conversation={CONV} messages={MESSAGES} onSend={vi.fn()} quickReplies={[]} />)
    expect(screen.getByText('need tirz')).toBeInTheDocument()
    expect(screen.getByText('in stock!')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/components/inbox/__tests__/ConversationPane.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create ConversationPane**

Create `src/components/inbox/ConversationPane.tsx`:

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { ChannelIcon, Icons } from '@/lib/icons'
import { initials } from '@/types/inbox'
import { MessageBubble } from './MessageBubble'
import { Composer } from './Composer'
import type { ConversationWithCustomer, MessageRow } from '@/types/inbox'
import type { QuickReply } from './Composer'

interface ConversationPaneProps {
  conversation: ConversationWithCustomer
  messages: MessageRow[]
  onSend: (content: string) => void
  quickReplies: QuickReply[]
  onSnooze?: () => void
  onResolve?: () => void
}

export function ConversationPane({
  conversation, messages, onSend, quickReplies, onSnooze, onResolve,
}: ConversationPaneProps) {
  const streamRef = useRef<HTMLDivElement>(null)
  const customer = conversation.customers
  const name = customer?.display_name ?? conversation.channel_identifier

  const channelLabel = conversation.channel_type === 'whatsapp' ? 'WhatsApp'
    : conversation.channel_type === 'telegram' ? 'Telegram'
    : 'Email'

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [messages.length])

  return (
    <div className={`pt-ix-conv pt-ix-${conversation.channel_type}`}>
      {/* Header */}
      <div className="pt-ix-conv-hd">
        <div className="pt-ix-conv-id">
          <div className="pt-ixt-av" data-channel={conversation.channel_type}>
            <span>{initials(name)}</span>
            <i className={`pt-thread-ch pt-ch-${conversation.channel_type}`}>
              <ChannelIcon channelType={conversation.channel_type} size={9} />
            </i>
          </div>
          <div>
            <div className="pt-ix-conv-name">{name}</div>
            <div className="pt-ix-conv-meta">
              <span className="mono">{conversation.channel_identifier}</span>
              <span className="pt-dot" />
              <span>{channelLabel}</span>
            </div>
          </div>
        </div>
        <div className="pt-ix-conv-actions">
          {onSnooze && (
            <button className="pt-btn pt-btn-ghost" onClick={onSnooze}>
              <Icons.clock size={12} /> Snooze
            </button>
          )}
          {onResolve && (
            <button className="pt-btn pt-btn-ghost" onClick={onResolve}>
              <Icons.check size={12} /> Resolve
            </button>
          )}
        </div>
      </div>

      {/* Message stream */}
      <div ref={streamRef} className="pt-ix-stream">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} channelType={conversation.channel_type} />
        ))}
        {messages.length === 0 && (
          <div style={{ alignSelf: 'center', color: 'var(--pt-fg-4)', fontSize: 12, marginTop: 40 }}>
            No messages yet
          </div>
        )}
      </div>

      {/* Composer */}
      <Composer
        onSend={onSend}
        channelType={conversation.channel_type}
        customerName={name}
        quickReplies={quickReplies}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/components/inbox/__tests__/ConversationPane.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/ConversationPane.tsx src/components/inbox/__tests__/ConversationPane.test.tsx
git commit -m "feat: add ConversationPane component"
```

---

## Task 8: CustomerRail

**Files:**
- Create: `src/components/inbox/CustomerRail.tsx`
- Create: `src/components/inbox/__tests__/CustomerRail.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/inbox/__tests__/CustomerRail.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CustomerRail } from '../CustomerRail'
import type { ConversationWithCustomer } from '@/types/inbox'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a>,
}))

const CONV: ConversationWithCustomer = {
  id: 'c1', status: 'needs_reply', unread_count: 0,
  last_message_at: null, last_message_snippet: null,
  channel_type: 'whatsapp', channel_identifier: '+15005550001',
  customers: { id: 'cust-1', display_name: 'K. (gymrat_84)', trust_score: 92, ltv: 2840, customer_tags: [{ tag: 'vip' }] },
}

describe('CustomerRail', () => {
  it('renders customer name', () => {
    render(<CustomerRail conversation={CONV} />)
    expect(screen.getByText('K. (gymrat_84)')).toBeInTheDocument()
  })

  it('renders trust score', () => {
    render(<CustomerRail conversation={CONV} />)
    expect(screen.getByText('92')).toBeInTheDocument()
  })

  it('renders LTV', () => {
    render(<CustomerRail conversation={CONV} />)
    expect(screen.getByText(/2,840/)).toBeInTheDocument()
  })

  it('renders VIP tag', () => {
    render(<CustomerRail conversation={CONV} />)
    expect(screen.getByText('vip')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/components/inbox/__tests__/CustomerRail.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create CustomerRail**

Create `src/components/inbox/CustomerRail.tsx`:

```typescript
import Link from 'next/link'
import { initials } from '@/types/inbox'
import type { ConversationWithCustomer } from '@/types/inbox'

interface CustomerRailProps {
  conversation: ConversationWithCustomer
}

export function CustomerRail({ conversation }: CustomerRailProps) {
  const customer = conversation.customers
  if (!customer) return null

  const name = customer.display_name
  const trustCls = customer.trust_score >= 85 ? 'hi' : customer.trust_score >= 65 ? 'md' : 'lo'

  const channelLabel = conversation.channel_type === 'whatsapp' ? 'WhatsApp'
    : conversation.channel_type === 'telegram' ? 'Telegram'
    : 'Email'

  return (
    <aside className="pt-ix-rail">
      {/* Customer card */}
      <div className="pt-cust">
        <div className="pt-cust-hd">
          <div className="pt-cust-av" data-channel={conversation.channel_type}>
            {initials(name)}
          </div>
          <div className="pt-cust-id">
            <div className="pt-cust-name">{name}</div>
            <div className="pt-cust-handle mono">{conversation.channel_identifier}</div>
          </div>
          <div className={`pt-trust pt-trust-${trustCls}`}>
            <div className="pt-trust-num">{customer.trust_score}</div>
            <div className="pt-trust-lbl">trust</div>
          </div>
        </div>

        <div className="pt-cust-stats">
          <div>
            <div className="lbl">LTV</div>
            <div className="val mono">${customer.ltv.toLocaleString()}</div>
          </div>
          <div>
            <div className="lbl">Channel</div>
            <div className="val">{channelLabel}</div>
          </div>
        </div>

        <div className="pt-cust-tags">
          {customer.customer_tags.map((t) => (
            <span key={t.tag} className="pt-tag pt-tag-soft">{t.tag}</span>
          ))}
        </div>
      </div>

      {/* Open profile link */}
      <div className="pt-right-section">
        <div className="pt-right-hd">
          <span>Customer</span>
          <Link href={`/customers/${customer.id}`} className="pt-link">Open →</Link>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/components/inbox/__tests__/CustomerRail.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: 47/47 pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/inbox/CustomerRail.tsx src/components/inbox/__tests__/CustomerRail.test.tsx
git commit -m "feat: add CustomerRail component"
```

---

## Task 9: InboxView + inbox pages (wire it all together)

**Files:**
- Create: `src/components/inbox/InboxView.tsx`
- Modify: `src/app/inbox/page.tsx`
- Create: `src/app/inbox/[conversationId]/page.tsx`

No unit tests for InboxView (real-time + routing integration — verified via dev server).

- [ ] **Step 1: Create InboxView (Client Component)**

Create `src/components/inbox/InboxView.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Shell } from '@/components/shell/Shell'
import { ThreadList } from './ThreadList'
import { ConversationPane } from './ConversationPane'
import { CustomerRail } from './CustomerRail'
import type { ConversationWithCustomer, MessageRow } from '@/types/inbox'
import type { QuickReply } from './Composer'

interface InboxViewProps {
  initialConversations: ConversationWithCustomer[]
  initialConversationId?: string | null
  initialMessages?: MessageRow[]
  quickReplies: QuickReply[]
}

export function InboxView({
  initialConversations,
  initialConversationId = null,
  initialMessages = [],
  quickReplies,
}: InboxViewProps) {
  const router = useRouter()
  const [conversations, setConversations] = useState(initialConversations)
  const [activeId, setActiveId] = useState<string | null>(initialConversationId)
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages)

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null

  // Real-time: conversations list updates
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('inbox-conversations')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
        setConversations((prev) =>
          prev
            .map((c) => (c.id === payload.new.id ? { ...c, ...(payload.new as Partial<ConversationWithCustomer>) } : c))
            .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
        )
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, async (payload) => {
        const sb = createClient()
        const { data } = await sb
          .from('conversations')
          .select('id, status, unread_count, last_message_at, last_message_snippet, channel_type, channel_identifier, customers(id, display_name, trust_score, ltv, customer_tags(tag))')
          .eq('id', payload.new.id)
          .single()
        if (data) {
          setConversations((prev) => [data as unknown as ConversationWithCustomer, ...prev])
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Real-time: messages for active conversation
  useEffect(() => {
    if (!activeId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`messages-${activeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new as MessageRow]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeId])

  const handleSelect = useCallback(async (id: string) => {
    setActiveId(id)
    router.push(`/inbox/${id}`, { scroll: false })

    // Load messages for selected conversation
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('id, direction, content, sent_at, status')
      .eq('conversation_id', id)
      .order('sent_at', { ascending: true })
      .limit(50)
    setMessages(data ?? [])

    // Mark as read
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)))
  }, [router])

  const handleSend = useCallback(async (content: string) => {
    if (!activeId) return
    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: activeId, content }),
    })
    // Message arrives via real-time subscription
  }, [activeId])

  return (
    <div className="pt-inbox">
      <ThreadList conversations={conversations} activeId={activeId} onSelect={handleSelect} />
      {activeConversation ? (
        <>
          <ConversationPane
            conversation={activeConversation}
            messages={messages}
            onSend={handleSend}
            quickReplies={quickReplies}
          />
          <CustomerRail conversation={activeConversation} />
        </>
      ) : (
        <div
          className="pt-ix-conv"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pt-fg-4)', fontSize: 13 }}
        >
          Select a conversation to start messaging
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update inbox root page**

Replace `src/app/inbox/page.tsx` with:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { InboxView } from '@/components/inbox/InboxView'

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, status, unread_count, last_message_at, last_message_snippet, channel_type, channel_identifier, customers(id, display_name, trust_score, ltv, customer_tags(tag))')
    .order('last_message_at', { ascending: false, nullsFirst: false })

  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: userRow } = authUser
    ? await supabase.from('users').select('tenant_id').eq('id', authUser.id).single()
    : { data: null }

  const { data: quickReplies } = userRow
    ? await supabase.from('quick_replies').select('id, label, content, sort_order').eq('tenant_id', userRow.tenant_id).order('sort_order')
    : { data: null }

  return (
    <Shell section="Inbox" isInbox>
      <InboxView
        initialConversations={(conversations ?? []) as Parameters<typeof InboxView>[0]['initialConversations']}
        quickReplies={quickReplies ?? []}
      />
    </Shell>
  )
}
```

- [ ] **Step 3: Create active conversation page**

Create `src/app/inbox/[conversationId]/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { InboxView } from '@/components/inbox/InboxView'

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, status, unread_count, last_message_at, last_message_snippet, channel_type, channel_identifier, customers(id, display_name, trust_score, ltv, customer_tags(tag))')
    .order('last_message_at', { ascending: false, nullsFirst: false })

  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, content, sent_at, status')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true })
    .limit(50)

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const { data: quickReplies } = userRow
    ? await supabase.from('quick_replies').select('id, label, content, sort_order').eq('tenant_id', userRow.tenant_id).order('sort_order')
    : { data: null }

  return (
    <Shell section="Inbox" isInbox>
      <InboxView
        initialConversations={(conversations ?? []) as Parameters<typeof InboxView>[0]['initialConversations']}
        initialConversationId={conversationId}
        initialMessages={(messages ?? []) as Parameters<typeof InboxView>[0]['initialMessages']}
        quickReplies={quickReplies ?? []}
      />
    </Shell>
  )
}
```

- [ ] **Step 4: Run all tests**

```bash
npm run test:run
```

Expected: 47/47 pass.

- [ ] **Step 5: Verify dev server — full inbox flow**

```bash
npm run dev
```

1. Navigate to http://localhost:3000 → should redirect to `/inbox`
2. http://localhost:3000/inbox → should show the Shell (sidebar + topbar) with the three-column inbox
3. If you have any conversations from webhook testing, they should appear in the thread list
4. Sidebar should show all nav items with Inbox highlighted
5. No TypeScript errors in terminal

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/inbox/InboxView.tsx src/app/inbox/
git commit -m "feat: wire up InboxView with real-time and routing"
```

---

## Task 10: Customer profile page

**Files:**
- Create: `src/app/customers/[customerId]/page.tsx`

- [ ] **Step 1: Create customer profile page**

Create `src/app/customers/[customerId]/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { initials } from '@/types/inbox'

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>
}) {
  const { customerId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: customer } = await supabase
    .from('customers')
    .select('id, display_name, trust_score, ltv, customer_channels(channel_type, display_handle, is_primary), customer_tags(tag)')
    .eq('id', customerId)
    .single()

  if (!customer) redirect('/inbox')

  const { data: customerNotes } = await supabase
    .from('notes')
    .select('id, content, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(5)

  const primaryChannel = customer.customer_channels?.find((c) => c.is_primary) ?? customer.customer_channels?.[0]
  const trustCls = customer.trust_score >= 85 ? 'hi' : customer.trust_score >= 65 ? 'md' : 'lo'

  const channelLabel = (ct: string) =>
    ct === 'whatsapp' ? 'WhatsApp' : ct === 'telegram' ? 'Telegram' : 'Email'

  return (
    <Shell section="Customers">
      <div className="pt-cu">
        {/* Header */}
        <div className="pt-cu-hd">
          <Link href="/inbox" className="pt-ix-back" title="Back to inbox">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6"/>
            </svg>
          </Link>
          <div className="pt-cu-hd-id">
            <div className="pt-cu-hd-av" data-channel={primaryChannel?.channel_type}>
              {initials(customer.display_name)}
            </div>
            <div>
              <div className="pt-cu-hd-name">
                {customer.display_name}
                {customer.customer_tags?.some((t) => t.tag === 'vip') && (
                  <span className="pt-tag pt-tag-vip">VIP</span>
                )}
              </div>
              <div className="pt-cu-hd-handle mono">
                {primaryChannel?.display_handle ?? '—'}
                {primaryChannel && ` · ${channelLabel(primaryChannel.channel_type)}`}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-cu-body">
          {/* Stats strip */}
          <div className="pt-cu-strip">
            <div className={`pt-cu-stat pt-cu-trust pt-trust-${trustCls}`}>
              <div className="lbl">Trust</div>
              <div className="val">{customer.trust_score}</div>
            </div>
            <div className="pt-cu-stat">
              <div className="lbl">LTV</div>
              <div className="val mono">${customer.ltv.toLocaleString()}</div>
            </div>
            {customer.customer_channels?.map((ch) => (
              <div key={ch.channel_type} className="pt-cu-stat">
                <div className="lbl">{channelLabel(ch.channel_type)}</div>
                <div className="val" style={{ fontSize: 13 }}>{ch.display_handle}</div>
              </div>
            ))}
          </div>

          <div className="pt-cu-grid">
            <div className="pt-cu-col">

              {/* Tags */}
              <div className="pt-card">
                <div className="pt-card-hd"><h3>Tags</h3></div>
                <div className="pt-card-body" style={{ padding: '4px 14px 12px' }}>
                  <div className="pt-cu-tags">
                    {customer.customer_tags?.length ? (
                      customer.customer_tags.map((t) => (
                        <span key={t.tag} className="pt-tag">{t.tag}</span>
                      ))
                    ) : (
                      <span style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>No tags</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="pt-card">
                <div className="pt-card-hd"><h3>Notes</h3></div>
                <ul className="pt-cu-notes">
                  {customerNotes && customerNotes.length > 0 ? (
                    customerNotes.map((n) => (
                      <li key={n.id}>
                        <div className="pt-cu-note-at mono">
                          {new Date(n.created_at).toLocaleDateString()}
                        </div>
                        <div className="pt-cu-note-text">{n.content}</div>
                      </li>
                    ))
                  ) : (
                    <li style={{ padding: '12px 14px', color: 'var(--pt-fg-4)', fontSize: 12 }}>
                      No notes yet
                    </li>
                  )}
                </ul>
              </div>

            </div>

            <div className="pt-cu-col">

              {/* Channels */}
              <div className="pt-card">
                <div className="pt-card-hd"><h3>Channels</h3></div>
                <div className="pt-card-body" style={{ padding: '4px 14px 12px' }}>
                  {customer.customer_channels?.map((ch) => (
                    <div key={ch.channel_type} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12 }}>
                      <span style={{ color: 'var(--pt-fg-4)', width: 80 }}>{channelLabel(ch.channel_type)}</span>
                      <span className="mono">{ch.display_handle}</span>
                      {ch.is_primary && <span className="pt-tag pt-tag-soft">primary</span>}
                    </div>
                  ))}
                  {!customer.customer_channels?.length && (
                    <span style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>No channels</span>
                  )}
                </div>
              </div>

              {/* Order history — stubbed until orders are built */}
              <div className="pt-card">
                <div className="pt-card-hd">
                  <h3>Orders</h3>
                  <p>Coming in Phase 3</p>
                </div>
                <div className="pt-card-body" style={{ padding: '8px 14px 14px' }}>
                  <div style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>
                    LTV ${customer.ltv.toLocaleString()} · order history available after Phase 3
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npm run test:run
```

Expected: 47/47 pass.

- [ ] **Step 3: Verify dev server**

```bash
npm run dev
```

1. http://localhost:3000/inbox → full inbox UI with shell
2. http://localhost:3000/settings/channels → channel settings (shell not shown here — that's fine for now)
3. If you have a customer ID in the DB, try http://localhost:3000/customers/{customerId} → customer profile

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/customers/
git commit -m "feat: add customer profile page"
```
