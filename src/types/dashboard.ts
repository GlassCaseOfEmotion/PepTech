export interface RevenueDay { d: string; v: number }

export interface PendingOrder {
  id: string
  refNumber: string
  customerName: string
  amount: number
  asset: string
  status: 'awaiting' | 'confirming'
  minsAgo: number
}

export type PackingOrder = {
  id: string
  refNumber: string
  customerName: string
}

export type ActivityItem = {
  id: string
  type: 'order_event' | 'message'
  label: string
  detail: string | null
  minsAgo: number
  href: string
}

export interface DashboardStats {
  revenue7d: number
  revenuePrev7d: number
  revenue90dDaily: RevenueDay[]
  pendingOrders: PendingOrder[]
  pendingTotal: number
}
