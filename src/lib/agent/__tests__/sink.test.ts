import { describe, it, expect, vi } from 'vitest'
import { createSseSink, createHeadlessSink } from '../sink'
import type { SseEvent } from '../types'

describe('createSseSink', () => {
  it('encodes events as SSE frames onto the controller and is streaming', () => {
    const chunks: string[] = []
    const controller = { enqueue: (b: Uint8Array) => chunks.push(new TextDecoder().decode(b)) }
    const sink = createSseSink(controller as never)
    expect(sink.streaming).toBe(true)
    sink.emit({ type: 'text', delta: 'hi' } as SseEvent)
    expect(chunks[0]).toBe(`data: ${JSON.stringify({ type: 'text', delta: 'hi' })}\n\n`)
  })
})

describe('createHeadlessSink', () => {
  it('records emitted events and is not streaming', () => {
    const sink = createHeadlessSink()
    expect(sink.streaming).toBe(false)
    sink.emit({ type: 'done', sessionId: 's1' })
    sink.emit({ type: 'error', message: 'x' })
    expect(sink.events).toEqual([{ type: 'done', sessionId: 's1' }, { type: 'error', message: 'x' }])
  })
})
