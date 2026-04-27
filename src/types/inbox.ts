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
