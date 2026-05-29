import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/catalog/reference/lookup', () => ({
  loadPeptideReference: vi.fn().mockResolvedValue([
    { id: 'r1', canonical_name: 'Retatrutide', family: 'GLP-1', description: '', aliases: ['reta'], protocol: {} },
  ]),
}))

import { getPeptideReference } from '../copilot-commerce'

describe('get_peptide_reference', () => {
  it('returns a compact name+aliases list', async () => {
    expect(getPeptideReference.name).toBe('get_peptide_reference')
    expect(getPeptideReference.requiresConfirmation).toBe(false)
    const out = await getPeptideReference.execute({}, {} as never, 't1') as { canonical_name: string; aliases: string[] }[]
    expect(out).toEqual([{ canonical_name: 'Retatrutide', family: 'GLP-1', aliases: ['reta'] }])
  })
})
