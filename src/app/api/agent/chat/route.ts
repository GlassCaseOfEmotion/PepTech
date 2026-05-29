import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { executeAgentTurn } from '@/lib/agent/executor'
import { createSseSink } from '@/lib/agent/sink'

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, message, mode, attachments } = await request.json() as {
    sessionId?: string; message?: string; mode?: 'ops' | 'onboarding';
    attachments?: { file_ref: string; filename: string; mime_type: string }[]
  }
  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const supabase = await createClient()
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = userRow.tenant_id

  // Create or reuse session
  let sid = sessionId
  if (!sid) {
    const trigger = mode === 'onboarding' ? 'onboarding' : 'user'
    const { data: session } = await supabase
      .from('agent_sessions')
      .insert({ tenant_id: tenantId, trigger })
      .select('id')
      .single()
    sid = session?.id
  }
  if (!sid) return NextResponse.json({ error: 'Could not create session' }, { status: 500 })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await executeAgentTurn(sid!, message, tenantId, supabase, createSseSink(controller), attachments ?? [])
      } catch (e) {
        const encoder = new TextEncoder()
        const msg = e instanceof Error ? e.message : 'Agent error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
