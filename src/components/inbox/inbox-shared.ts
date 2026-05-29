import { formatAmount } from '@/lib/currency'

export interface ActivityItem {
  id: string
  source: 'order' | 'tag'
  label: string
  ref_number: string | null
  amount: number | null
  note: string | null
  created_at: string
}

export function actBullet(item: ActivityItem) {
  if (item.source === 'tag') return ''
  const l = item.label.toLowerCase()
  if (l.includes('shipped') || l.includes('delivered') || l.includes('creat') || l.includes('draft')) return 'pt-bul-cool'
  if (l.includes('confirm')) return 'pt-bul-warn'
  return ''
}

export function actDetail(item: ActivityItem, baseCurrency: string) {
  if (item.source === 'tag') return item.note ? ` · ${item.note}` : ''
  const parts: string[] = []
  if (item.ref_number) parts.push(item.ref_number)
  if (item.amount != null && (item.label.toLowerCase().includes('creat') || item.label.toLowerCase().includes('draft'))) {
    parts.push(formatAmount(Number(item.amount), baseCurrency))
  }
  return parts.length ? ` · ${parts.join(' · ')}` : ''
}

export function fmtRelative(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  const days = Math.floor(mins / 1440)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export const CH_NAMES: Record<string, string> = { wa: 'WhatsApp', tg: 'Telegram', em: 'Email' }
