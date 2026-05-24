import { Icons } from '@/lib/icons'
import type { OrderStatus } from '@/types/orders'

export const CH_ICONS: Record<string, React.FC<{ size?: number }>> = {
  wa: Icons.wa,
  tg: Icons.tg,
  em: Icons.em,
}

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirming: 'packing',
  packing:    'shipped',
  shipped:    'delivered',
}

export const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirming: 'Confirm payment →',
  packing:    'Mark packed →',
  shipped:    'Mark delivered →',
}

export function initials(name: string): string {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0] ?? '?']).join('')
}
