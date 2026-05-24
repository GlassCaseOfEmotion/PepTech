import { describe, it, expect } from 'vitest'
import { dbConversationToThread, dbMessageToInboxMessage } from './inbox'

describe('dbConversationToThread', () => {
  it('maps channel_type to short key', () => {
    const thread = dbConversationToThread({
      id: 'c1', status: 'needs_reply', unread_count: 2,
      last_message_at: new Date().toISOString(),
      last_message_snippet: 'hey', channel_type: 'whatsapp',
      channel_identifier: '+1234', is_pinned: false, window_expires_at: null,
      customers: { id: 'u1', display_name: 'Alice', trust_score: 80, ltv: 500,
        customer_tags: [{ tag: 'vip' }],
        customer_channels: [{ channel_type: 'whatsapp', display_handle: '+1 ••• 4421', is_primary: true }],
        lifecycle_stage: 'customer' as const, acquisition_source: null }
    })
    expect(thread.channel).toBe('wa')
    expect(thread.name).toBe('Alice')
    expect(thread.handle).toBe('+1 ••• 4421')
    expect(thread.tags).toContain('vip')
    expect(thread.unread).toBe(2)
  })

  it('falls back to channel_identifier when no customer_channels', () => {
    const thread = dbConversationToThread({
      id: 'c2', status: 'new', unread_count: 0,
      last_message_at: null, last_message_snippet: null,
      channel_type: 'telegram', channel_identifier: '@swolepriest', is_pinned: false, window_expires_at: null,
      customers: { id: 'u2', display_name: 'Bob', trust_score: 70, ltv: 200,
        customer_tags: [], customer_channels: [],
        lifecycle_stage: 'customer' as const, acquisition_source: null }
    })
    expect(thread.channel).toBe('tg')
    expect(thread.handle).toBe('@swolepriest')
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

  it('maps outbound to "me"', () => {
    const msg = dbMessageToInboxMessage({
      id: 'm2', direction: 'outbound', content: 'hi',
      sent_at: new Date().toISOString(), status: 'sent', metadata: null
    })
    expect(msg.from).toBe('me')
    expect(msg.optimistic).toBe(false)
  })

  it('sets optimistic=true for sending status', () => {
    const msg = dbMessageToInboxMessage({
      id: 'm3', direction: 'outbound', content: 'hi',
      sent_at: new Date().toISOString(), status: 'sending', metadata: null
    })
    expect(msg.optimistic).toBe(true)
  })

  it('passes through metadata', () => {
    const msg = dbMessageToInboxMessage({
      id: 'm4', direction: 'outbound', content: 'wallet addr',
      sent_at: new Date().toISOString(), status: 'sent',
      metadata: { kind: 'wallet', asset: 'USDT', address: 'T9X...', amount: 330 }
    })
    expect(msg.kind).toBe('wallet')
    expect(msg.metadata?.asset).toBe('USDT')
  })
})
