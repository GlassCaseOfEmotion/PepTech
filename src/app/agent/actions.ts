'use server'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getSupabase() {
  const user = await getServerUser()
  if (!user) throw new Error('Unauthorized')
  return createClient()
}

export async function renameSession(sessionId: string, title: string): Promise<{ error?: string }> {
  try {
    const supabase = await getSupabase()
    const { error } = await supabase
      .from('agent_sessions')
      .update({ title: title.trim() || null })
      .eq('id', sessionId)
    if (error) return { error: error.message }
    revalidatePath('/agent')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteSession(sessionId: string): Promise<{ error?: string }> {
  try {
    const supabase = await getSupabase()
    const { error } = await supabase
      .from('agent_sessions')
      .delete()
      .eq('id', sessionId)
    if (error) return { error: error.message }
    revalidatePath('/agent')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
