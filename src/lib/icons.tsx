import React from 'react'

interface IconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

function PtIcon({ d, size = 14, children, className, style }: { d?: string; size?: number; children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }} className={className}
    >
      {d ? <path d={d} /> : children}
    </svg>
  )
}

export const Icons = {
  inbox:   (p: IconProps) => <PtIcon {...p} d="M22 12h-6l-2 3h-4l-2-3H2Z M5.5 5.5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" />,
  users:   (p: IconProps) => <PtIcon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M22 20a6.5 6.5 0 0 0-5-6.3"/></PtIcon>,
  box:     (p: IconProps) => <PtIcon {...p} d="M3.3 7.5 12 3l8.7 4.5v9L12 21l-8.7-4.5v-9Z M3.3 7.5 12 12l8.7-4.5 M12 12v9" />,
  flask:   (p: IconProps) => <PtIcon {...p} d="M9 3h6 M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3 M7 15h10" />,
  send:    (p: IconProps) => <PtIcon {...p} d="M22 3 11 14 M22 3l-7 18-4-7-7-4 18-7Z" />,
  zap:     (p: IconProps) => <PtIcon {...p} d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  vault:   (p: IconProps) => <PtIcon {...p}><rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="13" cy="12" r="3"/><path d="M13 9v-1 M13 16v-1 M16 12h1 M9 12h1"/></PtIcon>,
  search:  (p: IconProps) => <PtIcon {...p}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/></PtIcon>,
  bell:    (p: IconProps) => <PtIcon {...p} d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6 M10 19a2 2 0 0 0 4 0" />,
  plus:    (p: IconProps) => <PtIcon {...p} d="M12 5v14 M5 12h14" />,
  arrowDn: (p: IconProps) => <PtIcon {...p} d="M7 10l5 5 5-5" />,
  arrowL:  (p: IconProps) => <PtIcon {...p} d="M15 6l-6 6 6 6" />,
  check:   (p: IconProps) => <PtIcon {...p} d="M5 12.5 10 17 19 7" />,
  more:    (p: IconProps) => <PtIcon {...p}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></PtIcon>,
  filter:  (p: IconProps) => <PtIcon {...p} d="M3 5h18l-7 9v6l-4-2v-4L3 5Z" />,
  clock:   (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></PtIcon>,
  spark:   (p: IconProps) => <PtIcon {...p} d="M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1" />,
  gear:    (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></PtIcon>,
  user:    (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></PtIcon>,
  // Channel icons (filled circles with letterforms)
  wa:      (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M8 8.5c0-.5.4-.9 1-.9h.6c.4 0 .8.3.9.7l.4 1.4c.1.4 0 .8-.3 1l-.6.5c.7 1.4 1.8 2.5 3.2 3.2l.5-.6c.2-.3.6-.4 1-.3l1.4.4c.4.1.7.5.7.9V15c0 .6-.4 1-.9 1A7.5 7.5 0 0 1 8 8.5Z" stroke="white" fill="none"/></PtIcon>,
  tg:      (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M7 12.5 17 8.5l-1.5 8L12 14l-1 2.5L9.5 13Z" fill="white" stroke="white"/></PtIcon>,
  em:      (p: IconProps) => <PtIcon {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="m4 8 8 6 8-6"/></PtIcon>,
  truck:   (p: IconProps) => <PtIcon {...p} d="M2 7h11v10H2zM13 10h5l3 3v4h-8 M5.5 17a1.5 1.5 0 1 0 0 .01 M16.5 17a1.5 1.5 0 1 0 0 .01" />,
  wave:    (p: IconProps) => <PtIcon {...p} d="M3 12c2 0 2-3 4-3s2 6 4 6 2-6 4-6 2 3 4 3" />,
  rotate:  (p: IconProps) => <PtIcon {...p} d="M21 12a9 9 0 1 1-3.5-7.1 M21 4v5h-5" />,
  sun:     (p: IconProps) => <PtIcon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.5 4.5l1.5 1.5 M18 18l1.5 1.5 M4.5 19.5 6 18 M18 6l1.5-1.5"/></PtIcon>,
  alert:   (p: IconProps) => <PtIcon {...p}><path d="M12 2 2 20h20L12 2Z"/><path d="M12 9v5 M12 17v.5"/></PtIcon>,
  arrowUp: (p: IconProps) => <PtIcon {...p} d="M7 14l5-5 5 5" />,
  trend:   (p: IconProps) => <PtIcon {...p} d="M3 17l6-6 4 4 8-8 M14 7h7v7" />,
  x:       (p: IconProps) => <PtIcon {...p} d="M6 6l12 12 M18 6 6 18" />,
  hash:    (p: IconProps) => <PtIcon {...p} d="M4 9h16 M4 15h16 M10 3 8 21 M16 3l-2 18" />,
  wallet:  (p: IconProps) => <PtIcon {...p}><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18 M16 14h2"/></PtIcon>,
  shield:  (p: IconProps) => <PtIcon {...p} d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />,
  doc:     (p: IconProps) => <PtIcon {...p} d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z M14 3v6h6 M8 13h8 M8 17h6" />,
  lock:    (p: IconProps) => <PtIcon {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></PtIcon>,
  card:    (p: IconProps) => <PtIcon {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18 M7 15h3"/></PtIcon>,
  pin:     (p: IconProps) => <PtIcon {...p} d="M12 2a4 4 0 0 1 4 4c0 1.5-.5 2.8-1.3 3.7L16 17H8l1.3-7.3A5.4 5.4 0 0 1 8 6a4 4 0 0 1 4-4Z M12 17v5" />,
  pencil:  (p: IconProps) => <PtIcon {...p} d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />,
  trash:   (p: IconProps) => <PtIcon {...p} d="M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6" />,
  bot:     (p: IconProps) => <PtIcon {...p}><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V5 M9 5h6 M9 13h.01 M15 13h.01 M9 17h6"/></PtIcon>,
  wand:    (p: IconProps) => <PtIcon {...p} d="M15 4l5 5L7 22l-5-5L15 4Z M9 9l6 6 M14.5 2.5l1 1 M19.5 7.5l1 1 M2.5 14.5l1 1 M7.5 19.5l1 1" />,
  moon:    (p: IconProps) => <PtIcon {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  photo:   (p: IconProps) => <PtIcon {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M3 9h2l2-3h10l2 3"/></PtIcon>,
}

export function ChannelIcon({ channelType, size = 9 }: { channelType: 'whatsapp' | 'telegram' | 'email'; size?: number }) {
  if (channelType === 'whatsapp') return <Icons.wa size={size} />
  if (channelType === 'telegram') return <Icons.tg size={size} />
  return <Icons.em size={size} />
}
