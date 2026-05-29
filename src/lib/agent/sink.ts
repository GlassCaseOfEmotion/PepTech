import type { SseEvent } from './types'

/** Transport abstraction for an agent turn. The streaming sink writes SSE
 * frames to the live panel; the headless sink (background work) records events
 * but does not stream — message persistence happens in the executor regardless. */
export interface AgentSink {
  emit: (e: SseEvent) => void
  streaming: boolean
}

export function createSseSink(controller: ReadableStreamDefaultController<Uint8Array>): AgentSink {
  const encoder = new TextEncoder()
  return {
    streaming: true,
    emit: (e: SseEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)),
  }
}

export interface HeadlessSink extends AgentSink {
  events: SseEvent[]
}

export function createHeadlessSink(): HeadlessSink {
  const events: SseEvent[] = []
  return {
    streaming: false,
    events,
    emit: (e: SseEvent) => { events.push(e) },
  }
}
