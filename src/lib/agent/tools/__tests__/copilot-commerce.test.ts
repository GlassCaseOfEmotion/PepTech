import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/catalog/reference/lookup', () => ({
  loadPeptideReference: vi.fn().mockResolvedValue([
    { id: 'r1', canonical_name: 'Retatrutide', family: 'GLP-1', description: '', aliases: ['reta'], protocol: {} },
  ]),
}))

vi.mock('@/lib/agent/copilot/draft-order', () => ({
  mergeDraftItems: vi.fn().mockResolvedValue({ orderId: 'o1', total: 200 }),
  setShipping: vi.fn(),
  setPaymentAsset: vi.fn(),
  readDraftOrder: vi.fn(),
  finalizeDraftOrder: vi.fn(),
}))

vi.mock('@/lib/agent/copilot/deliver', () => ({
  deliverMessage: vi.fn().mockResolvedValue({ messageId: 'm1' }),
}))

import { getPeptideReference } from '../copilot-commerce'
import { updateDraftOrder, setShippingAddress, setPaymentAssetTool, getDraftOrder, finalizeOrder, sendMessage } from '../copilot-commerce'
import { mergeDraftItems } from '@/lib/agent/copilot/draft-order'
import { deliverMessage } from '@/lib/agent/copilot/deliver'

describe('get_peptide_reference', () => {
  it('returns a compact name+aliases list', async () => {
    expect(getPeptideReference.name).toBe('get_peptide_reference')
    expect(getPeptideReference.requiresConfirmation).toBe(false)
    const out = await getPeptideReference.execute({}, {} as never, 't1') as { canonical_name: string; aliases: string[] }[]
    expect(out).toEqual([{ canonical_name: 'Retatrutide', family: 'GLP-1', aliases: ['reta'] }])
  })
})

describe('copilot commerce tools', () => {
  it('declares the right names + confirm flags', () => {
    expect(updateDraftOrder.name).toBe('update_draft_order')
    expect(updateDraftOrder.requiresConfirmation).toBe(false)
    expect(setShippingAddress.name).toBe('set_shipping_address')
    expect(setShippingAddress.requiresConfirmation).toBe(false)
    expect(setPaymentAssetTool.name).toBe('set_payment_asset')
    expect(setPaymentAssetTool.requiresConfirmation).toBe(false)
    expect(getDraftOrder.name).toBe('get_draft_order')
    expect(getDraftOrder.requiresConfirmation).toBe(false)
    expect(finalizeOrder.name).toBe('finalize_order')
    expect(finalizeOrder.requiresConfirmation).toBe(true)
  })

  it('update_draft_order forwards deltas to the helper', async () => {
    const out = await updateDraftOrder.execute(
      { conversation_id: 'c1', customer_id: 'cu1', items: [{ product_id: 'p1', qty: 2 }] } as never,
      {} as never, 't1',
    )
    expect(mergeDraftItems).toHaveBeenCalledWith({}, 't1', 'c1', 'cu1', [{ product_id: 'p1', qty: 2 }])
    expect(out).toEqual({ orderId: 'o1', total: 200 })
  })
})

describe('send_message tool', () => {
  it('is gated and summarises the draft', () => {
    expect(sendMessage.name).toBe('send_message')
    expect(sendMessage.requiresConfirmation).toBe(true)
    expect(sendMessage.summarise?.({ conversation_id: 'c1', content: 'Hi Jordan, RETA-10 is in stock.' } as never)).toMatch(/RETA-10/)
  })

  it('forwards to deliverMessage', async () => {
    const out = await sendMessage.execute({ conversation_id: 'c1', content: 'hi' } as never, {} as never, 't1')
    expect(deliverMessage).toHaveBeenCalledWith({}, 't1', 'c1', 'hi')
    expect(out).toEqual({ messageId: 'm1' })
  })
})
