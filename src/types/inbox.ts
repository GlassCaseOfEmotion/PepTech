export type ConversationWithCustomer = {
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
  } | null
}

export type MessageRow = {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  sent_at: string
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'sending'
}

export function initials(name: string): string {
  if (!name) return '?'
  const upper = name.match(/[A-Z]/g)
  if (upper && upper.length >= 2) return upper.slice(0, 2).join('')
  return name.slice(0, 2).toUpperCase()
}

export function fmtTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 0) return 'now'
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m`
  if (diffMins < 60 * 24) return `${Math.floor(diffMins / 60)}h`
  return `${Math.floor(diffMins / 1440)}d`
}

// DB row shapes returned by Supabase queries
export type DbConversation = {
  id: string
  status: 'new' | 'needs_reply' | 'in_progress' | 'resolved' | 'snoozed'
  unread_count: number
  last_message_at: string | null
  last_message_snippet: string | null
  channel_type: 'whatsapp' | 'telegram' | 'email'
  channel_identifier: string
  is_pinned: boolean
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
  kind?: 'wallet' | 'tx' | 'photo'
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
  // photo
  storagePath?: string
  mediaUrl?: string   // signed URL, populated client-side — not stored in DB
  mimeType?: string
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

export type DbTemplate = {
  id: string
  tenant_id: string | null
  title: string
  content: string
  sort_order: number
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
  status: 'new' | 'needs_reply' | 'in_progress' | 'resolved' | 'snoozed'
  tags: string[]
  trust: number
  ltv: number
  pinned: boolean
}

export type InboxMessage = {
  id: string
  from: 'me' | 'them'
  at: string              // formatted timestamp
  text?: string
  kind?: 'text' | 'wallet' | 'tx' | 'photo' | 'invoice'
  optimistic?: boolean
  status?: string
  metadata?: MessageMetadata | null
}

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
    pinned: c.is_pinned,
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
    kind: m.metadata?.kind ?? 'text',
    optimistic: m.status === 'sending',
    status: m.status,
    metadata: m.metadata,
  }
}
