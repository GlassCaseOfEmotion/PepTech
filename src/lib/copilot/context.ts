import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getCustomer, getConversationMessages, queryCatalog } from '@/lib/agent/tools/read'
import { computeCoProductAffinity, type CoProduct } from '@/lib/catalog/affinity'
import { COPILOT_HISTORY_LIMIT } from './types'
import type { ConvMessage } from './prefilter'

type Db = SupabaseClient<Database>

export interface CopilotContext {
  customer: unknown
  messages: ConvMessage[]
  catalog: { id: string; name: string; total_stock: number; unit_price: number; margin_pct: number | null }[]
  affinity: Record<string, CoProduct[]>
}

export async function gatherContext(
  supabase: Db,
  tenantId: string,
  conversationId: string,
  customerId: string,
): Promise<CopilotContext> {
  const [customer, messages, catalog] = await Promise.all([
    getCustomer.execute({ id: customerId }, supabase, tenantId).catch(() => null),
    getConversationMessages.execute(
      { conversation_id: conversationId, limit: COPILOT_HISTORY_LIMIT },
      supabase,
      tenantId,
    ).catch(() => []),
    queryCatalog.execute({}, supabase, tenantId).catch(() => []),
  ])

  // Affinity over the last 30 days of fulfilled orders (same window as catalog page).
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('order_items(product_id)')
    .eq('tenant_id', tenantId)
    .in('status', ['packing', 'shipped', 'delivered'])
    .gte('created_at', thirtyDaysAgo)

  return {
    customer,
    messages: (messages as ConvMessage[]) ?? [],
    catalog: (catalog as CopilotContext['catalog']) ?? [],
    affinity: computeCoProductAffinity((recentOrders as { order_items: { product_id: string }[] | null }[]) ?? []),
  }
}
