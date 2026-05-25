// src/lib/catalog/reference/__tests__/match.test.ts
import { describe, it, expect } from 'vitest'
import { normaliseName, findMatch } from '../match'
import type { PeptideReference } from '../types'

function ref(canonical_name: string, aliases: string[]): PeptideReference {
  return {
    id: `id-${canonical_name}`,
    canonical_name,
    aliases,
    family: 'HEALING',
    description: 'x',
    protocol: {
      vial_strength: null, reconstitution_ml: null, draw_volume_ml: null,
      frequency: null, timing: null, cycle_length_weeks: null, notes: null, dose_display: null,
    },
  }
}

describe('normaliseName', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normaliseName('  BPC-157   5mg  ')).toBe('bpc 157')
  })
  it('treats hyphens, slashes, underscores as spaces', () => {
    expect(normaliseName('BPC-157')).toBe('bpc 157')
    expect(normaliseName('BPC_157')).toBe('bpc 157')
    expect(normaliseName('BPC/157')).toBe('bpc 157')
  })
  it('strips trailing dose suffix', () => {
    expect(normaliseName('Tirzepatide 30mg')).toBe('tirzepatide')
    expect(normaliseName('5-Amino-1MQ Capsule 50mg x 60caps')).toBe('5 amino 1mq capsule')
  })
  it('returns empty string for empty input', () => {
    expect(normaliseName('')).toBe('')
    expect(normaliseName('   ')).toBe('')
  })
})

describe('findMatch', () => {
  const references: PeptideReference[] = [
    ref('BPC-157 5mg', ['BPC157', 'BPC 157', 'Body Protection Compound 157']),
    ref('Semaglutide 10mg', ['SEMA', 'semaglutide', 'Ozempic', 'Wegovy']),
    ref('TB-500 5mg', ['TB500', 'TB 500', 'Thymosin Beta-4 fragment']),
  ]

  it('matches by canonical name (case-insensitive)', () => {
    const m = findMatch('BPC-157 5mg', references)
    expect(m?.reference.canonical_name).toBe('BPC-157 5mg')
  })
  it('matches by alias', () => {
    expect(findMatch('SEMA', references)?.reference.canonical_name).toBe('Semaglutide 10mg')
    expect(findMatch('Ozempic', references)?.reference.canonical_name).toBe('Semaglutide 10mg')
  })
  it('matches across hyphen/space variants', () => {
    expect(findMatch('BPC157', references)?.reference.canonical_name).toBe('BPC-157 5mg')
    expect(findMatch('BPC 157 5mg', references)?.reference.canonical_name).toBe('BPC-157 5mg')
  })
  it('returns null when nothing matches', () => {
    expect(findMatch('Wolverine Pen 15mg', references)).toBeNull()
    expect(findMatch('', references)).toBeNull()
  })
  it('exposes which alias matched', () => {
    const m = findMatch('Ozempic', references)
    expect(m?.matched_via).toBe('Ozempic')
  })
})
