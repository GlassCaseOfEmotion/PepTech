import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { confirmToolCall } from '@/lib/agent/executor'
import { createSseSink } from '@/lib/agent/sink'

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, messageId, toolCallId, confirmed } =
    await request.json() as { sessionId?: string; messageId?: string; toolCallId?: string; confirmed?: boolean }

  if (!sessionId || !messageId || !toolCallId || confirmed === undefined) {
    return NextResponse.json({ error: 'sessionId, messageId, toolCallId, confirmed required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = userRow.tenant_id

  // Verify session belongs to this tenant
  const { data: session } = await supabase
    .from('agent_sessions').select('id').eq('id', sessionId).eq('tenant_id', tenantId).single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await confirmToolCall(sessionId, messageId, toolCallId, confirmed, tenantId, supabase, createSseSink(controller))
      } catch (e) {
        const encoder = new TextEncoder()
        const msg = e instanceof Error ? e.message : 'Confirm error'
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
