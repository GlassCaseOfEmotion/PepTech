# Inbox Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data in the Inbox with live Supabase data — real conversations, messages, quick replies, customer notes — plus real-time updates and working send/snooze/done actions.

**Architecture:** The server page fetches initial conversations and quick replies; an `InboxProvider` client component holds inbox state, exposes actions (send, snooze, mark done, fetch messages), and owns all Supabase subscriptions. `InboxView` and its sub-components stay purely presentational, consuming data via React context. No prop drilling past InboxView.

**Tech Stack:** Next.js 15 App Router, Supabase SSR (server fetches) + browser client (client-side mutations and real-time), React context, Vitest

---

## Feature Map — Every Field On Screen

Before tasks, here is every visible field and its data source:

### Thread List (left column)
| Field | Source |
|---|---|
| Customer name | `customers.display_name` |
| Channel icon | `conversations.channel_type` → wa/tg/em |
| Message snippet | `conversations.last_message_snippet` |
| Time ago | computed from `conversations.last_message_at` |
| Unread badge | `conversations.unread_count` |
| Tags (vip, payment, etc.) | `customer_tags.tag[]` via customer join |
| Trust score | `customers.trust_score` |
| Handle (masked) | `customer_channels.display_handle` |
| Filter pill counts | counts grouped by `conversations.status` |

### Conversation Pane (middle)
| Field | Source |
|---|---|
| Customer name + handle | from active conversation's customer join |
| Channel label | `conversations.channel_type` |
| Message bubbles (text) | `messages.content`, `messages.direction`, `messages.sent_at`, `messages.status` |
| Message bubbles (wallet) | `messages.metadata.kind='wallet'`, `.asset`, `.network`, `.address`, `.amount` |
| Message bubbles (tx) | `messages.metadata.kind='tx'`, `.asset`, `.tx_id`, `.confirmations`, `.required_confirmations`, `.state` |
| "read" / "sending" status | `messages.status` |
| Typing indicator | keep mock (no real typing detection) |
| Snooze action | UPDATE `conversations.status = 'snoozed'` |
| Mark done action | UPDATE `conversations.status = 'resolved'` |

### Composer
| Field | Source |
|---|---|
| Placeholder ("Message X via Y") | active conversation customer name + channel |
| Quick replies | `quick_replies` table (label, content, sort_order) |
| Send action | INSERT into `messages`, UPDATE `conversations.last_message_at/snippet` |
| Attach / flask / vault / template | stub buttons (no backend yet) |

### Right Rail
| Field | Source |
|---|---|
| Customer name, handle, trust, ltv | from active conversation's customer join |
| Tags | `customer_tags` |
| Channel | `conversations.channel_type` |
| Last order | **mock** (orders schema not yet built) |
| Open order | **mock** |
| Notes | `notes` table WHERE `customer_id = conversation.customer_id` |
| Activity | **mock** |

---

## File Structure

```
src/lib/supabase/
  client.ts                          NEW — browser Supabase client (singleton)

src/types/
  inbox.ts                           MODIFY — add DB-accurate types alongside existing

src/components/inbox/
  InboxProvider.tsx                  NEW — context, state, all Supabase logic
  InboxView.tsx                      MODIFY — consume context instead of mock data

src/app/inbox/
  page.tsx                           MODIFY — fetch initial conversations + quick replies
```

---

## Task 1: Supabase Browser Client + Inbox Types

**Files:**
- Create: `src/lib/supabase/client.ts`
- Modify: `src/types/inbox.ts`

- [ ] **Step 1: Create browser Supabase client**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Add DB-accurate inbox types to `src/types/inbox.ts`**

Read the current file first, then append:

```typescript
// DB row shapes returned by Supabase queries
export type DbConversation = {
  id: string
  status: 'new' | 'needs_reply' | 'in_progress' | 'resolved' | 'snoozed'
  unread_count: number
  last_message_at: string | null
  last_message_snippet: string | null
  channel_type: 'whatsapp' | 'telegram' | 'email'
  channel_identifier: string
  customers: {
    id: string
    display_name: string
    trust_score: number
    ltv: number
    customer_tags: { tag: string }[]
    customer_channels: { channel_type: string; display_handle: string; is_primary: boolean }[]
  } | null
}

export type DbMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  sent_at: string
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  metadata: MessageMetadata | null
}

export type MessageMetadata = {
  kind?: 'wallet' | 'tx'
  // wallet
  asset?: string
  network?: string
  address?: string
  amount?: number
  // tx
  tx_id?: string
  confirmations?: number
  required_confirmations?: number
  state?: 'pending' | 'confirmed' | 'failed'
}

export type DbQuickReply = {
  id: string
  label: string
  content: string
  sort_order: number
}

export type DbNote = {
  id: string
  content: string
  created_at: string
}

// Display shape used by InboxView components
export type InboxThread = {
  id: string              // conversation id
  customerId: string
  name: string            // customers.display_name
  handle: string          // customer_channels.display_handle
  channel: 'wa' | 'tg' | 'em'
  snippet: string
  minsAgo: number
  unread: number
  status: string
  tags: string[]
  trust: number
  ltv: number
}

export type InboxMessage = {
  id: string
  from: 'me' | 'them'
  at: string              // formatted timestamp
  text?: string
  kind?: 'text' | 'wallet' | 'tx'
  optimistic?: boolean
  status?: string
  metadata?: MessageMetadata | null
}
```

- [ ] **Step 3: Add pure mapping helpers to `src/types/inbox.ts`**

```typescript
// Mapping helpers (pure functions, easy to test)
const CH_MAP: Record<string, 'wa' | 'tg' | 'em'> = {
  whatsapp: 'wa', telegram: 'tg', email: 'em'
}

export function dbConversationToThread(c: DbConversation): InboxThread {
  const primaryChannel = c.customers?.customer_channels?.find(ch => ch.is_primary)
    ?? c.customers?.customer_channels?.[0]
  const now = Date.now()
  const msgAt = c.last_message_at ? new Date(c.last_message_at).getTime() : now
  const minsAgo = Math.floor((now - msgAt) / 60000)
  return {
    id: c.id,
    customerId: c.customers?.id ?? '',
    name: c.customers?.display_name ?? 'Unknown',
    handle: primaryChannel?.display_handle ?? c.channel_identifier,
    channel: CH_MAP[c.channel_type] ?? 'wa',
    snippet: c.last_message_snippet ?? '',
    minsAgo,
    unread: c.unread_count,
    status: c.status,
    tags: c.customers?.customer_tags?.map(t => t.tag) ?? [],
    trust: c.customers?.trust_score ?? 0,
    ltv: c.customers?.ltv ?? 0,
  }
}

export function dbMessageToInboxMessage(m: DbMessage): InboxMessage {
  const d = new Date(m.sent_at)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const at = isToday
    ? `Today · ${timeStr}`
    : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${timeStr}`
  return {
    id: m.id,
    from: m.direction === 'outbound' ? 'me' : 'them',
    at,
    text: m.content,
    kind: (m.metadata?.kind as InboxMessage['kind']) ?? 'text',
    optimistic: m.status === 'sending',
    status: m.status,
    metadata: m.metadata,
  }
}
```

- [ ] **Step 4: Write unit tests for the mapping helpers**

```typescript
// src/types/inbox.test.ts
import { describe, it, expect } from 'vitest'
import { dbConversationToThread, dbMessageToInboxMessage } from './inbox'

describe('dbConversationToThread', () => {
  it('maps channel_type to short key', () => {
    const thread = dbConversationToThread({
      id: 'c1', status: 'needs_reply', unread_count: 2,
      last_message_at: new Date().toISOString(),
      last_message_snippet: 'hey', channel_type: 'whatsapp',
      channel_identifier: '+1234',
      customers: { id: 'u1', display_name: 'Alice', trust_score: 80, ltv: 500,
        customer_tags: [{ tag: 'vip' }],
        customer_channels: [{ channel_type: 'whatsapp', display_handle: '+1 ••• 4421', is_primary: true }] }
    })
    expect(thread.channel).toBe('wa')
    expect(thread.name).toBe('Alice')
    expect(thread.handle).toBe('+1 ••• 4421')
    expect(thread.tags).toContain('vip')
    expect(thread.unread).toBe(2)
  })
})

describe('dbMessageToInboxMessage', () => {
  it('maps inbound direction to "them"', () => {
    const msg = dbMessageToInboxMessage({
      id: 'm1', direction: 'inbound', content: 'hello',
      sent_at: new Date().toISOString(), status: 'read', metadata: null
    })
    expect(msg.from).toBe('them')
    expect(msg.text).toBe('hello')
    expect(msg.optimistic).toBe(false)
  })

  it('sets optimistic=true for sending status', () => {
    const msg = dbMessageToInboxMessage({
      id: 'm2', direction: 'outbound', content: 'hi',
      sent_at: new Date().toISOString(), status: 'sending', metadata: null
    })
    expect(msg.from).toBe('me')
    expect(msg.optimistic).toBe(true)
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- src/types/inbox.test.ts
```
Expected: 3 passing

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/client.ts src/types/inbox.ts src/types/inbox.test.ts
git commit -m "feat: add browser supabase client and inbox DB types with mapping helpers"
```

---

## Task 2: Page Fetches Initial Conversations + Quick Replies

**Files:**
- Modify: `src/app/inbox/page.tsx`

The server page fetches everything needed for first render so the inbox is populated immediately (no client-side loading flash).

- [ ] **Step 1: Rewrite `src/app/inbox/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { InboxView } from '@/components/inbox/InboxView'
import type { DbConversation, DbQuickReply } from '@/types/inbox'

export default async function InboxPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: conversations }, { data: quickReplies }] = await Promise.all([
    supabase
      .from('conversations')
      .select(`
        id, status, unread_count, last_message_at, last_message_snippet,
        channel_type, channel_identifier,
        customers (
          id, display_name, trust_score, ltv,
          customer_tags (tag),
          customer_channels (channel_type, display_handle, is_primary)
        )
      `)
      .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('quick_replies')
      .select('id, label, content, sort_order')
      .order('sort_order'),
  ])

  return (
    <InboxView
      initialConversations={(conversations ?? []) as DbConversation[]}
      quickReplies={(quickReplies ?? []) as DbQuickReply[]}
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep inbox
```
Expected: no inbox-related errors

- [ ] **Step 3: Commit**

```bash
git add src/app/inbox/page.tsx
git commit -m "feat: inbox page fetches real conversations and quick replies from Supabase"
```

---

## Task 3: InboxProvider — Context, State, and Actions

**Files:**
- Create: `src/components/inbox/InboxProvider.tsx`

This is the heart of the feature. It owns all mutable state and exposes actions to child components via context.

- [ ] **Step 1: Create InboxProvider**

```typescript
// src/components/inbox/InboxProvider.tsx
'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  dbConversationToThread, dbMessageToInboxMessage,
  type DbConversation, type DbQuickReply, type InboxThread, type InboxMessage, type DbNote
} from '@/types/inbox'

type InboxCtx = {
  threads: InboxThread[]
  activeId: string
  setActiveId: (id: string) => void
  filter: string
  setFilter: (f: string) => void
  messages: InboxMessage[]
  notes: DbNote[]
  quickReplies: DbQuickReply[]
  isSending: boolean
  sendMessage: (text: string) => Promise<void>
  snooze: () => Promise<void>
  markDone: () => Promise<void>
}

const InboxContext = createContext<InboxCtx | null>(null)

export function useInbox() {
  const ctx = useContext(InboxContext)
  if (!ctx) throw new Error('useInbox must be used inside InboxProvider')
  return ctx
}

interface Props {
  initialConversations: DbConversation[]
  quickReplies: DbQuickReply[]
  children: ReactNode
}

export function InboxProvider({ initialConversations, quickReplies, children }: Props) {
  const supabase = createClient()
  const [threads, setThreads] = useState<InboxThread[]>(
    initialConversations.map(dbConversationToThread)
  )
  const [activeId, setActiveIdRaw] = useState(threads[0]?.id ?? '')
  const [filter, setFilter] = useState('all')
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [notes, setNotes] = useState<DbNote[]>([])
  const [isSending, setIsSending] = useState(false)
  const activeThread = threads.find(t => t.id === activeId)

  // ── Fetch messages for a conversation ──────────────────────────────────────
  const fetchMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, direction, content, sent_at, status, metadata')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })
      .limit(100)
    setMessages((data ?? []).map(dbMessageToInboxMessage))
  }, [supabase])

  // ── Fetch notes for a customer ─────────────────────────────────────────────
  const fetchNotes = useCallback(async (customerId: string) => {
    const { data } = await supabase
      .from('notes')
      .select('id, content, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10)
    setNotes((data ?? []) as DbNote[])
  }, [supabase])

  // ── Select a conversation ──────────────────────────────────────────────────
  const setActiveId = useCallback((id: string) => {
    setActiveIdRaw(id)
    setMessages([])
    setNotes([])
    fetchMessages(id)
    const thread = threads.find(t => t.id === id)
    if (thread?.customerId) fetchNotes(thread.customerId)
    // Reset unread count locally
    setThreads(prev => prev.map(t => t.id === id ? { ...t, unread: 0 } : t))
    // Persist unread reset to DB (fire and forget)
    supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)
  }, [threads, fetchMessages, fetchNotes, supabase])

  // ── Send a message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!activeId || !text.trim()) return
    const tempId = `tmp-${Date.now()}`
    const now = new Date().toISOString()
    const optimistic: InboxMessage = {
      id: tempId, from: 'me', at: 'Today · just now',
      text, kind: 'text', optimistic: true,
    }
    setMessages(prev => [...prev, optimistic])
    setIsSending(true)
    try {
      const { data: msg } = await supabase
        .from('messages')
        .insert({
          conversation_id: activeId,
          direction: 'outbound',
          content: text,
          status: 'sent',
          sent_at: now,
        })
        .select('id, direction, content, sent_at, status, metadata')
        .single()

      if (msg) {
        // Replace optimistic with real message
        setMessages(prev => prev.map(m => m.id === tempId ? dbMessageToInboxMessage(msg) : m))
        // Update conversation snippet in list
        const snippet = text.slice(0, 120)
        setThreads(prev => prev.map(t =>
          t.id === activeId ? { ...t, snippet, minsAgo: 0 } : t
        ))
        // Persist conversation update
        await supabase.from('conversations').update({
          last_message_at: now,
          last_message_snippet: snippet,
          status: 'in_progress',
        }).eq('id', activeId)
      }
    } finally {
      setIsSending(false)
    }
  }, [activeId, supabase])

  // ── Snooze ─────────────────────────────────────────────────────────────────
  const snooze = useCallback(async () => {
    if (!activeId) return
    await supabase.from('conversations').update({ status: 'snoozed' }).eq('id', activeId)
    setThreads(prev => prev.map(t => t.id === activeId ? { ...t, status: 'snoozed' } : t))
  }, [activeId, supabase])

  // ── Mark done ──────────────────────────────────────────────────────────────
  const markDone = useCallback(async () => {
    if (!activeId) return
    await supabase.from('conversations').update({ status: 'resolved' }).eq('id', activeId)
    setThreads(prev => prev.filter(t => t.id !== activeId))
    const remaining = threads.filter(t => t.id !== activeId)
    if (remaining.length > 0) setActiveId(remaining[0].id)
  }, [activeId, threads, supabase, setActiveId])

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId)
      const thread = threads.find(t => t.id === activeId)
      if (thread?.customerId) fetchNotes(thread.customerId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  return (
    <InboxContext.Provider value={{
      threads, activeId, setActiveId, filter, setFilter,
      messages, notes, quickReplies, isSending, sendMessage, snooze, markDone,
    }}>
      {children}
    </InboxContext.Provider>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep InboxProvider
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/InboxProvider.tsx
git commit -m "feat: InboxProvider with real send, snooze, markDone, fetchMessages, fetchNotes"
```

---

## Task 4: Wire InboxView to Real Data

**Files:**
- Modify: `src/components/inbox/InboxView.tsx`

Replace MOCK_THREADS, MOCK_MESSAGES, MOCK_QUICK_REPLIES with context. Keep all visual components (Bubble, IxThread, Composer, etc.) — just change the data source.

- [ ] **Step 1: Read the current InboxView.tsx to understand its structure**

The file is at `src/components/inbox/InboxView.tsx`. Understand the props for each sub-component before editing.

- [ ] **Step 2: Update InboxView to accept real props and wrap with InboxProvider**

Replace the top of the file:

```typescript
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { InboxProvider, useInbox } from './InboxProvider'
import type { DbConversation, DbQuickReply, InboxThread, InboxMessage } from '@/types/inbox'

// CH_ICONS, CH_NAMES, initials, fmtMins helpers stay unchanged

interface InboxViewProps {
  initialConversations: DbConversation[]
  quickReplies: DbQuickReply[]
}

export function InboxView({ initialConversations, quickReplies }: InboxViewProps) {
  return (
    <InboxProvider initialConversations={initialConversations} quickReplies={quickReplies}>
      <InboxLayout />
    </InboxProvider>
  )
}

function InboxLayout() {
  const { threads, activeId, setActiveId, filter, setFilter, messages, isSending, sendMessage } = useInbox()
  const activeThread = threads.find(t => t.id === activeId) ?? threads[0]

  return (
    <div className="pt-inbox">
      <ThreadColumn
        threads={threads}
        activeId={activeThread?.id ?? ''}
        onSelect={setActiveId}
        filter={filter}
        setFilter={setFilter}
      />
      {activeThread && (
        <ConversationPane
          thread={activeThread}
          messages={messages}
          onSend={sendMessage}
          isSending={isSending}
        />
      )}
      {activeThread && <ConversationRail thread={activeThread} />}
    </div>
  )
}
```

- [ ] **Step 3: Update ThreadColumn to use real filter counts**

Replace the hardcoded filter counts inside ThreadColumn:

```typescript
function ThreadColumn({ threads, activeId, onSelect, filter, setFilter }) {
  const counts = {
    all: threads.length,
    needs_reply: threads.filter(t => t.status === 'needs_reply').length,
    new: threads.filter(t => t.status === 'new').length,
    snoozed: threads.filter(t => t.status === 'snoozed').length,
  }

  const filtered = threads.filter(t => {
    if (filter === 'all') return true
    return t.status === filter
  })

  // search stays the same — filter by t.name or t.handle
  // rest of the render stays unchanged
}
```

The filter pill JSX:
```tsx
<button className={`pt-ix-pill${filter === 'all' ? ' is-on' : ''}`} onClick={() => setFilter('all')}>
  All <span className="pt-ix-pill-ct">{counts.all}</span>
</button>
<button className={`pt-ix-pill${filter === 'needs_reply' ? ' is-on' : ''}`} onClick={() => setFilter('needs_reply')}>
  Needs reply <span className="pt-ix-pill-ct">{counts.needs_reply}</span>
</button>
<button className={`pt-ix-pill${filter === 'new' ? ' is-on' : ''}`} onClick={() => setFilter('new')}>
  New <span className="pt-ix-pill-ct">{counts.new}</span>
</button>
<button className={`pt-ix-pill${filter === 'snoozed' ? ' is-on' : ''}`} onClick={() => setFilter('snoozed')}>
  Snoozed <span className="pt-ix-pill-ct">{counts.snoozed}</span>
</button>
```

- [ ] **Step 4: Update ConversationPane to use snooze/markDone from context**

Inside ConversationPane, pull from context:

```typescript
function ConversationPane({ thread, messages, onSend, isSending }) {
  const { snooze, markDone } = useInbox()
  // ... rest of component stays the same
  // Wire the buttons:
  // <button onClick={snooze}>Snooze</button>
  // <button onClick={markDone}>Mark done</button>
}
```

- [ ] **Step 5: Update Composer to use quickReplies from context**

```typescript
function Composer({ onSend, isSending, thread }) {
  const { quickReplies } = useInbox()
  // Replace MOCK_QUICK_REPLIES with quickReplies
  // Map: quickReply.content is the text to insert (was quickReply.text)
  // quickReply.label is the button label
}
```

- [ ] **Step 6: Update ConversationRail to use real notes from context**

```typescript
function ConversationRail({ thread }) {
  const { notes } = useInbox()
  // Replace mock notes section with real notes:
  // notes.map(n => (
  //   <div className="pt-rail-note">
  //     <div className="pt-rail-note-meta">{fmtRelative(n.created_at)}</div>
  //     <div>{n.content}</div>
  //   </div>
  // ))
}
```

Add a `fmtRelative` helper:
```typescript
function fmtRelative(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  const days = Math.floor(mins / 1440)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
```

- [ ] **Step 7: Run the dev server and verify the inbox loads**

```bash
npm run dev
```
Navigate to `http://localhost:3000/inbox`. Verify:
- Thread list shows 7 real conversations from DB (gymrat_84, swolepriest, etc.)
- Filter pills show correct counts
- Clicking a thread loads real messages
- Right rail shows real customer notes

- [ ] **Step 8: Commit**

```bash
git add src/components/inbox/InboxView.tsx
git commit -m "feat: wire InboxView to real conversations, messages, quick replies, notes"
```

---

## Task 5: Real-Time Subscriptions

**Files:**
- Modify: `src/components/inbox/InboxProvider.tsx`

Add Supabase `postgres_changes` subscriptions so new inbound messages appear instantly and the conversation list updates when snippet/unread changes.

- [ ] **Step 1: Add message subscription to InboxProvider**

Inside the `InboxProvider` function body, add after the existing `useEffect`:

```typescript
// ── Real-time: messages for active conversation ────────────────────────────
useEffect(() => {
  if (!activeId) return

  const channel = supabase
    .channel(`messages:${activeId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
      (payload) => {
        const newMsg = dbMessageToInboxMessage(payload.new as any)
        setMessages(prev => {
          // Avoid duplicates (our own optimistic sends will already be in state)
          if (prev.some(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
      }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [activeId, supabase])
```

- [ ] **Step 2: Add conversation list subscription**

```typescript
// ── Real-time: conversation list (snippet, unread, status) ────────────────
useEffect(() => {
  const channel = supabase
    .channel('conversations:list')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversations' },
      (payload) => {
        const updated = payload.new as any
        setThreads(prev => prev.map(t => {
          if (t.id !== updated.id) return t
          return {
            ...t,
            snippet: updated.last_message_snippet ?? t.snippet,
            unread: updated.unread_count ?? t.unread,
            status: updated.status,
            minsAgo: updated.last_message_at
              ? Math.floor((Date.now() - new Date(updated.last_message_at).getTime()) / 60000)
              : t.minsAgo,
          }
        }))
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversations' },
      async (payload) => {
        // New conversation arrived — fetch it with full customer join
        const { data } = await supabase
          .from('conversations')
          .select(`
            id, status, unread_count, last_message_at, last_message_snippet,
            channel_type, channel_identifier,
            customers (
              id, display_name, trust_score, ltv,
              customer_tags (tag),
              customer_channels (channel_type, display_handle, is_primary)
            )
          `)
          .eq('id', payload.new.id)
          .single()
        if (data) {
          setThreads(prev => [dbConversationToThread(data as any), ...prev])
        }
      }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [supabase])
```

- [ ] **Step 3: Verify real-time works**

With the dev server running, open `http://localhost:3000/inbox`. Then in Supabase dashboard SQL Editor, run:

```sql
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000000',
  'inbound',
  'test real-time message',
  'delivered'
);
```

Expected: the message appears in the inbox conversation pane without refreshing.

- [ ] **Step 4: Commit**

```bash
git add src/components/inbox/InboxProvider.tsx
git commit -m "feat: add real-time Supabase subscriptions for messages and conversation list"
```

---

## Task 6: Wallet and TX Message Bubbles

**Files:**
- Modify: `src/components/inbox/InboxView.tsx` (Bubble component)

The `Bubble` component already handles `kind === 'wallet'` and `kind === 'tx'` in the mock implementation. Wire these to read from `message.metadata`.

- [ ] **Step 1: Update the Bubble component to read from metadata**

Locate the `Bubble` function in InboxView.tsx. Ensure it uses `m.metadata` for wallet/tx content:

```typescript
function Bubble({ m }: { m: InboxMessage }) {
  if (m.kind === 'wallet') {
    const { asset, network, address, amount } = m.metadata ?? {}
    return (
      <div className={`pt-bubble pt-bubble-${m.from} pt-bubble-card`}>
        <div className="pt-bubble-card-hd">
          <span className="pt-bubble-asset">{asset ?? 'USDT'} · {network ?? 'TRC20'}</span>
          <span className="pt-bubble-amt mono">${amount?.toFixed(2) ?? '—'}</span>
        </div>
        <div className="pt-bubble-addr mono">{address ?? '—'}</div>
        <div className="pt-bubble-card-actions">
          <button className="pt-btn pt-btn-ghost pt-btn-sm"
            onClick={() => address && navigator.clipboard.writeText(address)}>Copy</button>
          <button className="pt-btn pt-btn-ghost pt-btn-sm">QR</button>
        </div>
        <div className="pt-bubble-meta">{m.at}</div>
      </div>
    )
  }

  if (m.kind === 'tx') {
    const { asset, tx_id, confirmations, required_confirmations, state } = m.metadata ?? {}
    const conf = confirmations ?? 0
    const req = required_confirmations ?? 3
    const pct = Math.min(1, conf / req)
    return (
      <div className={`pt-bubble pt-bubble-${m.from}`}>
        <div className="pt-bubble-tx">
          <span className="pt-bubble-asset">{asset ?? 'USDT'}</span>
          <span className="mono pt-bubble-txid">{tx_id ? `${tx_id.slice(0, 6)}…${tx_id.slice(-4)}` : '—'}</span>
          <span className={`pt-bubble-conf ${state === 'confirmed' ? 'is-ok' : 'is-warn'}`}>
            {conf}/{req} conf
          </span>
        </div>
        <div className="pt-confbar"><div className="pt-confbar-fill" style={{ width: `${pct * 100}%` }} /></div>
        <div className="pt-bubble-meta">{m.at} · {state ?? 'pending'}</div>
      </div>
    )
  }

  // Default text bubble
  return (
    <div className={`pt-bubble pt-bubble-${m.from}${m.optimistic ? ' is-optimistic' : ''}`}>
      <div className="pt-bubble-text">{m.text}</div>
      <div className="pt-bubble-meta">
        {m.at}
        {m.from === 'me' && (m.optimistic ? ' · sending…' : ' · sent')}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify bubbles render**

In Supabase SQL Editor, insert a wallet-type message:

```sql
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, status, metadata)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000000',
  'outbound',
  'USDT TRC20: T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a',
  'sent',
  '{"kind":"wallet","asset":"USDT","network":"TRC20","address":"T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a","amount":330}'
);
```

Expected: wallet card bubble appears in the gymrat_84 conversation.

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/InboxView.tsx
git commit -m "feat: wallet and tx message bubbles read from metadata field"
```

---

## Task 7: DB Trigger — Auto-Update Conversation on New Message

**Files:**
- Create migration via Supabase MCP

When a new message is inserted, the conversation's `last_message_at`, `last_message_snippet`, and `unread_count` (for inbound) should update automatically. This way webhook handlers don't need to maintain this manually.

- [ ] **Step 1: Apply migration**

Via Supabase MCP `apply_migration`:

```sql
CREATE OR REPLACE FUNCTION public.on_message_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.sent_at,
    last_message_snippet = LEFT(NEW.content, 120),
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_insert ON public.messages;
CREATE TRIGGER trg_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_insert();
```

Migration name: `auto_update_conversation_on_message`

- [ ] **Step 2: Test the trigger**

```sql
-- Insert an inbound message
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000000',
  'inbound', 'trigger test message', 'delivered'
);

-- Verify conversation updated
SELECT id, last_message_snippet, unread_count FROM public.conversations
WHERE id = 'e2000000-0000-0000-0000-000000000000';
```

Expected: `last_message_snippet = 'trigger test message'`, `unread_count` incremented by 1.

- [ ] **Step 3: Remove manual conversation update from sendMessage in InboxProvider**

Now that the trigger handles it, simplify `sendMessage` — remove the manual `conversations.update()` call for `last_message_at` and `last_message_snippet`. Keep the local state update for the UI (optimistic). Keep the `status: 'in_progress'` update (trigger doesn't handle status).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: DB trigger auto-updates conversation snippet and unread count on message insert"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] `/inbox` loads with real conversations from DB, sorted by recency
- [ ] Filter pills (All, Needs reply, New, Snoozed) show correct counts and filter correctly
- [ ] Clicking a thread loads its real messages; timestamps are correct
- [ ] Text messages render as text bubbles
- [ ] Wallet-type messages (metadata.kind='wallet') render as wallet card bubbles with Copy button
- [ ] TX-type messages (metadata.kind='tx') render with confirmation bar
- [ ] Typing a message and pressing ⌘↵ inserts optimistic bubble, then confirms when DB insert succeeds
- [ ] Quick replies from DB appear in composer and click to insert text
- [ ] Snooze button updates conversation status and removes thread from list
- [ ] Mark done button updates status and advances to next conversation
- [ ] Right rail shows real customer name, trust score, LTV, tags
- [ ] Right rail shows real notes from the notes table
- [ ] Inserting a message via SQL Editor causes it to appear in the inbox without refresh (real-time)
- [ ] Conversation list updates snippet and unread count in real-time when new inbound message arrives
- [ ] Unread badge resets to 0 when a conversation is opened
