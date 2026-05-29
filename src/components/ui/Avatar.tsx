'use client'

import { useState } from 'react'
import { initials } from '@/types/inbox'
import { Icons } from '@/lib/icons'

type Channel = 'wa' | 'tg' | 'em'

const CH_ICON: Record<Channel, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

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
      {channel && (() => {
        const ChIcon = CH_ICON[channel]
        return <i className={`pt-avatar-ch pt-avatar-ch-${channel}`}><ChIcon size={9} /></i>
      })()}
    </div>
  )
}
