import { describe, it, expect } from 'vitest'
import { ALL_TOOLS, TOOL_MAP, OPENAI_TOOLS } from '../tools/index'

describe('agent tool registry', () => {
  it('exports all 10 tools', () => {
    expect(ALL_TOOLS).toHaveLength(10)
  })

  it('TOOL_MAP keys match tool names', () => {
    for (const tool of ALL_TOOLS) {
      expect(TOOL_MAP[tool.name]).toBe(tool)
    }
  })

  it('OPENAI_TOOLS have type, function.name, function.description', () => {
    for (const t of OPENAI_TOOLS) {
      expect(t.type).toBe('function')
      expect(t.function.name).toBeTruthy()
      expect(t.function.description).toBeTruthy()
    }
  })

  it('read tools do not require confirmation', () => {
    const readNames = ['query_customers', 'get_customer', 'query_orders', 'get_order', 'query_catalog', 'get_analytics']
    for (const name of readNames) {
      expect(TOOL_MAP[name].requiresConfirmation).toBe(false)
    }
  })

  it('write tools require confirmation', () => {
    const writeNames = ['create_order', 'update_order_status', 'generate_invoice']
    for (const name of writeNames) {
      expect(TOOL_MAP[name].requiresConfirmation).toBe(true)
    }
  })

  it('all tools have an execute function', () => {
    for (const tool of ALL_TOOLS) {
      expect(typeof tool.execute).toBe('function')
    }
  })
})
