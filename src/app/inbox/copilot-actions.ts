'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createOrder } from '@/app/orders/actions'
import {
  mapSuggestionRow,
  draftOrderToCreateOrderInput,
  type SuggestionRow,
  type DraftOrderPayload,
} from '@/types/copilot'

export async function getOpenSuggestions(conversationId: string): Promise<SuggestionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_suggestions')
    .select('id, conversation_id, customer_id, kind, status, payload, confidence, reasoning, created_at')
    .eq('conversation_id', conversationId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data.map(r => mapSuggestionRow(r as never))
}

export async function dismissSuggestion(id: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('ai_suggestions')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

/** For reply / quote / cross_sell: deliver the (edited) message, then mark sent. */
export async function sendSuggestionMessage(
  id: string,
  message: string,
): Promise<{ success: true } | { error: string }> {
  const trimmed = message.trim()
  if (!trimmed) return { error: 'Message is empty' }

  const supabase = await createClient()
  const { data: row, error: fetchErr } = await supabase
    .from('ai_suggestions')
    .select('conversation_id, status')
    .eq('id', id)
    .single()
  if (fetchErr || !row) return { error: 'Suggestion not found' }
  if (row.status !== 'open') return { error: 'Suggestion already actioned' }

  // Reuse the cookie-forwarding send pattern from approveAndSendQueuedRun.
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join('; ')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
  const sendRes = await fetch(`${baseUrl}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ conversationId: row.conversation_id, content: trimmed }),
  })
  if (!sendRes.ok) {
    const body = await sendRes.json().catch(() => ({}))
    return { error: (body as { error?: string }).error ?? 'Failed to send' }
  }

  await supabase
    .from('ai_suggestions')
    .update({ status: 'sent', payload: { message: trimmed } as never, updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/inbox')
  return { success: true }
}

/** For draft_order: commit the order via the existing server action, then mark committed. */
export async function commitDraftOrder(
  id: string,
): Promise<{ success: true; orderId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: row, error: fetchErr } = await supabase
    .from('ai_suggestions')
    .select('conversation_id, payload, status')
    .eq('id', id)
    .single()
  if (fetchErr || !row) return { error: 'Suggestion not found' }
  if (row.status !== 'open') return { error: 'Suggestion already actioned' }

  const input = draftOrderToCreateOrderInput(
    row.payload as unknown as DraftOrderPayload,
    row.conversation_id,
  )
  const result = await createOrder(input)
  if ('error' in result) return { error: result.error }

  await supabase
    .from('ai_suggestions')
    .update({ status: 'committed', updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/inbox')
  return { success: true, orderId: result.orderId }
}
