import { describe, it, expect } from 'vitest'
import { computeSupply, frequencyToDaily } from '@/types/protocols'
import type { ProductProtocol, CustomerProtocolOverride } from '@/types/protocols'

const baseProtocol: ProductProtocol = {
  id: 'p1', tenant_id: 't1', product_id: 'prod1',
  vial_strength: '5mg',
  reconstitution_ml: 2,
  reconstitution_solvent: 'bacteriostatic water',
  draw_volume_ml: 0.1,
  frequency: 'once_daily',
  timing: null, cycle_length_weeks: null, storage: null, notes: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

describe('frequencyToDaily', () => {
  it('once_daily = 1',       () => expect(frequencyToDaily('once_daily')).toBe(1))
  it('twice_daily = 2',      () => expect(frequencyToDaily('twice_daily')).toBe(2))
  it('eod = 0.5',            () => expect(frequencyToDaily('eod')).toBe(0.5))
  it('3x_weekly ≈ 3/7',     () => expect(frequencyToDaily('3x_weekly')).toBeCloseTo(3 / 7))
  it('weekly ≈ 1/7',         () => expect(frequencyToDaily('weekly')).toBeCloseTo(1 / 7))
})

describe('computeSupply', () => {
  it('computes 20 day supply for 1 vial at 0.1ml once_daily (2/0.1=20 draws, 20/1=20 days)', () => {
    const today = new Date()
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: today.toISOString(), protocol: baseProtocol, today,
    })
    expect(cycle.totalDays).toBeCloseTo(20)
  })

  it('computes correct daysRemaining when ordered 5 days ago', () => {
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(5), protocol: baseProtocol,
    })
    expect(cycle.daysRemaining).toBeCloseTo(15)
    expect(cycle.status).toBe('ok')
  })

  it('status is low when daysRemaining <= 10', () => {
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(12), protocol: baseProtocol,
    })
    expect(cycle.daysRemaining).toBeCloseTo(8)
    expect(cycle.status).toBe('low')
  })

  it('status is low when pctRemaining <= 0.25 (31 of 40 days elapsed)', () => {
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 2, orderDate: daysAgo(31), protocol: baseProtocol,
    })
    expect(cycle.pctRemaining).toBeCloseTo(9 / 40)
    expect(cycle.status).toBe('low')
  })

  it('status is critical when supply elapsed', () => {
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(25), protocol: baseProtocol,
    })
    expect(cycle.daysRemaining).toBeLessThan(0)
    expect(cycle.status).toBe('critical')
    expect(cycle.pctRemaining).toBe(0)
  })

  it('applies draw_volume_ml override (0.2ml -> 10 draws -> 10 days)', () => {
    const override: CustomerProtocolOverride = {
      id: 'o1', tenant_id: 't1', customer_id: 'c1', product_id: 'prod1',
      draw_volume_ml: 0.2, frequency: null, notes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(0), protocol: baseProtocol, override,
    })
    expect(cycle.totalDays).toBeCloseTo(10)
    expect(cycle.hasOverride).toBe(true)
    expect(cycle.effectiveDrawMl).toBe(0.2)
  })

  it('applies frequency override (twice_daily -> 20 draws / 2 = 10 days)', () => {
    const override: CustomerProtocolOverride = {
      id: 'o1', tenant_id: 't1', customer_id: 'c1', product_id: 'prod1',
      draw_volume_ml: null, frequency: 'twice_daily', notes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(0), protocol: baseProtocol, override,
    })
    expect(cycle.totalDays).toBeCloseTo(10)
    expect(cycle.hasOverride).toBe(true)
    expect(cycle.effectiveFrequency).toBe('twice_daily')
  })
})
