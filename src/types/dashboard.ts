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

export interface DashboardStats {
  revenue7d: number
  revenuePrev7d: number
  revenue90dDaily: RevenueDay[]
  pendingOrders: PendingOrder[]
  pendingTotal: number
}
