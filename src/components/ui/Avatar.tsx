import { initials } from '@/types/inbox'

type Channel = 'wa' | 'tg' | 'em'

// 8 well-spaced hues. A stable hash of the name picks one.
const HUES = [350, 25, 90, 145, 190, 240, 285, 320]

function hueFor(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

export function Avatar({ name, channel, size = 36 }: { name: string; channel?: Channel; size?: number }) {
  const hue = hueFor(name || '?')
  return (
    <div
      className="pt-avatar"
      style={{ width: size, height: size, ['--pt-av-h' as string]: hue }}
      aria-hidden
    >
      <span className="pt-avatar-init">{initials(name)}</span>
      {channel && <i className={`pt-avatar-ch pt-avatar-ch-${channel}`} />}
    </div>
  )
}
