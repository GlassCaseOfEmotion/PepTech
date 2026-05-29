import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { SuggestionDraft } from './types'

type Db = SupabaseClient<Database>

export interface PersistTarget {
  tenantId: string
  conversationId: string
  customerId: string
}

export async function dedupAndPersist(
  supabase: Db,
  target: PersistTarget,
  drafts: SuggestionDraft[],
): Promise<number> {
  if (drafts.length === 0) return 0

  const { data: openRows } = await supabase
    .from('ai_suggestions')
    .select('dedup_key')
    .eq('conversation_id', target.conversationId)
    .eq('status', 'open')

  const openKeys = new Set((openRows ?? []).map(r => (r as { dedup_key: string }).dedup_key))
  const fresh = drafts.filter(d => !openKeys.has(d.dedupKey))
  if (fresh.length === 0) return 0

  const rows = fresh.map(d => ({
    tenant_id: target.tenantId,
    conversation_id: target.conversationId,
    customer_id: target.customerId,
    kind: d.kind,
    status: 'open' as const,
    payload: d.payload as never,
    confidence: d.confidence,
    reasoning: d.reasoning,
    dedup_key: d.dedupKey,
  }))

  const { error } = await supabase.from('ai_suggestions').insert(rows)
  if (error) {
    console.error('[copilot] failed to persist suggestions:', error.message)
    return 0
  }
  return rows.length
}
