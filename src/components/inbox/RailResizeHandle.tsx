'use client'

import { useRef } from 'react'

interface Props {
  minWidth: number
  maxWidth: number
  /** Called on pointerup with the final committed width (parent persists + sets state). */
  onCommit: (width: number) => void
  /** Called on double-click to restore the default panel width. */
  onReset: () => void
}

const INBOX_SEL = '.pt-inbox'

/** A 6px draggable strip on the left edge of the rail region. Mutates the
 * .pt-inbox `--pt-rail-w` CSS variable directly during drag (no React
 * re-renders), then commits the final width on pointerup so it persists. */
export function RailResizeHandle({ minWidth, maxWidth, onCommit, onReset }: Props) {
  const startX = useRef(0)
  const startW = useRef(0)
  const current = useRef<number | null>(null)
  const inbox = useRef<HTMLElement | null>(null)

  function onPointerMove(e: PointerEvent) {
    // Dragging LEFT widens the rail.
    const delta = startX.current - e.clientX
    const next = Math.min(maxWidth, Math.max(minWidth, startW.current + delta))
    current.current = next
    inbox.current?.style.setProperty('--pt-rail-w', `${next}px`)
  }

  function onPointerUp() {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.body.classList.remove('pt-resizing-rail')
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    if (current.current != null) onCommit(current.current)
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    const el = (e.currentTarget as HTMLElement).closest(INBOX_SEL) as HTMLElement | null
    if (!el) return
    inbox.current = el
    startX.current = e.clientX
    // Use the actual rendered width of the rail region, not the CSS var (which
    // may be unset on first drag and falling back to the default).
    const region = (e.currentTarget as HTMLElement).parentElement
    startW.current = region?.getBoundingClientRect().width ?? 368
    current.current = null
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.body.classList.add('pt-resizing-rail')
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <div
      className="pt-ix-rail-resize"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize · double-click to reset"
    />
  )
}
