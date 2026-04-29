import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processInboundMessage } from '../processor'

// Helper: creates a chainable update mock that supports two .eq() calls,
// resolving to { error: null } after the second .eq().
function makeUpdateChain(onUpdate?: (data: unknown) => void) {
  let callCount = 0
  const chain: Record<string, unknown> = {
    update: vi.fn().mockImplementation((data: unknown) => { onUpdate?.(data); return chain }),
    eq: vi.fn().mockImplementation(() => {
      callCount++
      return callCount >= 2 ? Promise.resolve({ error: null }) : chain
    }),
  }
  return chain
}

// Build a minimal chainable Supabase mock
function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  return {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    _chain: chain,
  }
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000002'
const CONV_ID = '00000000-0000-0000-0000-000000000003'
const MSG_ID = '00000000-0000-0000-0000-000000000004'

const BASE_PARAMS = {
  tenantId: TENANT_ID,
  channelType: 'telegram' as const,
  identifier: '12345678',
  displayHandle: '@gymrat_84',
  content: 'hello world',
  externalId: 'tg-msg-001',
  sentAt: '2026-04-27T10:00:00.000Z',
}

describe('processInboundMessage', () => {
  describe('first contact — customer does not exist yet', () => {
    it('creates a customer, channel, and conversation then inserts the message', async () => {
      const fromSequence = [
        // 1. customer_channels lookup → not found
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) },
        // 2. customers insert → returns customer
        { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: CUSTOMER_ID, tenant_id: TENANT_ID, display_name: '@gymrat_84' }, error: null }) },
        // 3. customer_channels insert → returns channel
        { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'cc-1', customer_id: CUSTOMER_ID }, error: null }) },
        // 4. conversations lookup → not found
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) },
        // 5. conversations insert → returns conversation
        { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: CONV_ID, status: 'new', unread_count: 0 }, error: null }) },
        // 6. messages insert → returns message
        { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: MSG_ID }, error: null }) },
        // 7. conversations update (snippet)
        makeUpdateChain(),
      ]

      let callCount = 0
      const mockFrom = vi.fn().mockImplementation(() => fromSequence[callCount++] ?? fromSequence[fromSequence.length - 1])
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      const supabaseWithSeq = { from: mockFrom, rpc: mockRpc } as unknown as Parameters<typeof processInboundMessage>[0]

      const result = await processInboundMessage(supabaseWithSeq, BASE_PARAMS)

      expect(result.conversationId).toBe(CONV_ID)
      expect(result.messageId).toBe(MSG_ID)
      expect(mockFrom).toHaveBeenCalledWith('customers')
      expect(mockFrom).toHaveBeenCalledWith('customer_channels')
      expect(mockFrom).toHaveBeenCalledWith('conversations')
      expect(mockFrom).toHaveBeenCalledWith('messages')
      expect(mockRpc).toHaveBeenCalledWith('increment_unread_count', { conv_id: CONV_ID, tenant: TENANT_ID })
    })
  })

  describe('returning customer — conversation exists', () => {
    it('skips customer creation and inserts directly into existing conversation', async () => {
      const fromSequence = [
        // 1. customer_channels lookup → found
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { customer_id: CUSTOMER_ID }, error: null }) },
        // 2. conversations lookup → found
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: CONV_ID, status: 'in_progress', unread_count: 1 }, error: null }) },
        // 3. messages insert
        { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: MSG_ID }, error: null }) },
        // 4. conversations update
        makeUpdateChain(),
      ]

      let callCount = 0
      const mockFrom = vi.fn().mockImplementation(() => fromSequence[callCount++] ?? fromSequence[fromSequence.length - 1])
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      const supabase = { from: mockFrom, rpc: mockRpc } as unknown as Parameters<typeof processInboundMessage>[0]

      const result = await processInboundMessage(supabase, BASE_PARAMS)

      expect(result.conversationId).toBe(CONV_ID)
      // customers should NOT have been called
      const allTableNames = mockFrom.mock.calls.map((c) => c[0])
      expect(allTableNames).not.toContain('customers')
    })
  })

  describe('status transitions', () => {
    it('moves a resolved conversation back to needs_reply on inbound message', async () => {
      const capturedUpdates: unknown[] = []
      const updateChain = makeUpdateChain((data) => capturedUpdates.push(data))
      const fromSequence = [
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { customer_id: CUSTOMER_ID }, error: null }) },
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: CONV_ID, status: 'resolved', unread_count: 0 }, error: null }) },
        { upsert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: MSG_ID }, error: null }) },
        updateChain,
      ]

      let callCount = 0
      const mockFrom = vi.fn().mockImplementation(() => fromSequence[callCount++] ?? fromSequence[fromSequence.length - 1])
      const supabase = { from: mockFrom, rpc: vi.fn().mockResolvedValue({ error: null }) } as unknown as Parameters<typeof processInboundMessage>[0]
      await processInboundMessage(supabase, BASE_PARAMS)

      expect(capturedUpdates[0]).toMatchObject({ status: 'needs_reply' })
    })
  })
})
