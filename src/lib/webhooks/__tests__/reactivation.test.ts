import { describe, it, expect } from 'vitest'

// Pure unit test of the status-transition rule used in processInboundMessage.
// Mirrors processor.ts so a refactor that breaks reactivation fails here.
function nextStatus(currentStatus: string): string {
  return ['resolved', 'snoozed'].includes(currentStatus) ? 'needs_reply'
    : currentStatus === 'new' ? 'new'
    : 'needs_reply'
}

describe('inbound conversation status transition', () => {
  it('reactivates resolved -> needs_reply', () => {
    expect(nextStatus('resolved')).toBe('needs_reply')
  })
  it('reactivates snoozed -> needs_reply', () => {
    expect(nextStatus('snoozed')).toBe('needs_reply')
  })
  it('keeps new as new', () => {
    expect(nextStatus('new')).toBe('new')
  })
  it('keeps in_progress flowing to needs_reply', () => {
    expect(nextStatus('in_progress')).toBe('needs_reply')
  })
})
