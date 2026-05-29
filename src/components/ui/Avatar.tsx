'use client'

import { useState } from 'react'
import { initials } from '@/types/inbox'

type Channel = 'wa' | 'tg' | 'em'

// Symbol-only glyphs (no enclosing circle — the badge provides that). Filled
// shapes read far better than strokes at ~10px. White via currentColor.
function ChannelGlyph({ channel }: { channel: Channel }) {
  if (channel === 'tg') {
    // paper plane
    return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 4 3 11.2l5.2 2 2 6.3 3-3.6 4.8 3.6z" /></svg>
  }
  if (channel === 'em') {
    // envelope (outline)
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="m4 8 8 5.5 8-5.5" /></svg>
  }
  // whatsapp — chat bubble with tail
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16a1.2 1.2 0 0 1 1.2 1.2v8.6A1.2 1.2 0 0 1 20 16H9.5L5 20v-4H4a1.2 1.2 0 0 1-1.2-1.2V6.2A1.2 1.2 0 0 1 4 5z" /></svg>
}

// 8 well-spaced hues for the fallback circle. A stable hash of the name picks one.
const HUES = [350, 25, 90, 145, 190, 240, 285, 320]

function hueFor(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

/** Customer/agent avatar. Renders a fun, colourful DiceBear "fun-emoji" smiley
 * (seeded by name, so each person keeps the same face), with a coloured-circle
 * + initials fallback if the DiceBear service is unreachable. Optional channel
 * badge dot. */
export function Avatar({ name, channel, size = 36, seed }: { name: string; channel?: Channel; size?: number; seed?: string }) {
  const [imgOk, setImgOk] = useState(true)
  const hue = hueFor(name || '?')
  const url = `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(seed || name || '?')}`
  return (
    <div
      className="pt-avatar"
      style={{ width: size, height: size, ['--pt-av-h' as string]: hue }}
      aria-hidden
    >
      {imgOk
        ? <img className="pt-avatar-img" src={url} alt="" loading="lazy" onError={() => setImgOk(false)} />
        : <span className="pt-avatar-init">{initials(name)}</span>}
      {channel && <i className={`pt-avatar-ch pt-avatar-ch-${channel}`}><ChannelGlyph channel={channel} /></i>}
    </div>
  )
}
