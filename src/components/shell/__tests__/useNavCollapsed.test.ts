import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNavCollapsed } from '../useNavCollapsed'

describe('useNavCollapsed', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = '<div class="pt-root"></div>'
  })

  it('defaults to collapsed when nothing stored', () => {
    const { result } = renderHook(() => useNavCollapsed())
    expect(result.current.collapsed).toBe(true)
    expect(document.querySelector('.pt-root')!.classList.contains('pt-nav-collapsed')).toBe(true)
  })

  it('restores expanded state from localStorage', () => {
    localStorage.setItem('pt-nav-collapsed', '0')
    const { result } = renderHook(() => useNavCollapsed())
    expect(result.current.collapsed).toBe(false)
    expect(document.querySelector('.pt-root')!.classList.contains('pt-nav-collapsed')).toBe(false)
  })

  it('toggle flips state, persists, and updates the root class', () => {
    const { result } = renderHook(() => useNavCollapsed())
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem('pt-nav-collapsed')).toBe('0')
    expect(document.querySelector('.pt-root')!.classList.contains('pt-nav-collapsed')).toBe(false)
  })
})
