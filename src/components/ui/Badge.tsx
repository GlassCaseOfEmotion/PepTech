type BadgeTone = 'neutral' | 'accent' | 'lead' | 'vip' | 'new' | 'warn' | 'ok' | 'danger'

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return <span className={`pt-badge pt-badge-${tone}`}>{children}</span>
}
