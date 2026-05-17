export type Frequency = 'once_daily' | 'twice_daily' | 'eod' | '3x_weekly' | '5_on_2_off' | 'weekly'

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  once_daily:  'Once daily',
  twice_daily: 'Twice daily',
  eod:         'Every other day',
  '3x_weekly': '3× weekly',
  '5_on_2_off': '5 days on, 2 days off',
  weekly:      'Weekly',
}

export const FREQUENCY_OPTIONS: Frequency[] = ['once_daily', 'twice_daily', 'eod', '3x_weekly', '5_on_2_off', 'weekly']

export interface ProductProtocol {
  id: string
  tenant_id: string
  product_id: string
  vial_strength: string | null
  reconstitution_ml: number
  draw_volume_ml: number
  frequency: Frequency
  timing: string | null
  cycle_length_weeks: number | null
  storage: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CustomerProtocolOverride {
  id: string
  tenant_id: string
  customer_id: string
  product_id: string
  draw_volume_ml: number | null
  frequency: Frequency | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type SupplyStatus = 'ok' | 'low' | 'critical'

export interface ActiveCycle {
  productId: string
  productName: string
  unitsOrdered: number
  orderDate: string
  totalDays: number
  daysRemaining: number
  pctRemaining: number
  status: SupplyStatus
  effectiveDrawMl: number
  effectiveFrequency: Frequency
  hasOverride: boolean
  reconstitutionMl: number
  cycleLengthWeeks: number | null
  estimatedEndDate: string
}

export interface OrderedProductNoProtocol {
  productId: string
  productName: string
  pendingDelivery?: boolean  // true = protocol exists but order not yet delivered
}

export type CycleEntry = ActiveCycle | OrderedProductNoProtocol

export function isCycle(e: CycleEntry): e is ActiveCycle {
  return 'totalDays' in e
}

export function frequencyToDaily(freq: Frequency): number {
  switch (freq) {
    case 'once_daily':  return 1
    case 'twice_daily': return 2
    case 'eod':         return 0.5
    case '3x_weekly':   return 3 / 7
    case '5_on_2_off':  return 5 / 7
    case 'weekly':      return 1 / 7
  }
}

export function computeSupply(params: {
  productId: string
  productName: string
  unitsOrdered: number
  orderDate: string
  protocol: ProductProtocol
  override?: CustomerProtocolOverride | null
  today?: Date
}): ActiveCycle {
  const today = params.today ?? new Date()
  const effectiveDrawMl = params.override?.draw_volume_ml ?? params.protocol.draw_volume_ml
  const effectiveFrequency: Frequency = params.override?.frequency ?? params.protocol.frequency

  const drawsPerVial = params.protocol.reconstitution_ml / effectiveDrawMl
  const injectionsPerDay = frequencyToDaily(effectiveFrequency)
  const daysPerVial = drawsPerVial / injectionsPerDay
  const totalDays = params.unitsOrdered * daysPerVial

  const daysElapsed = (today.getTime() - new Date(params.orderDate).getTime()) / 86_400_000
  const daysRemaining = totalDays - daysElapsed
  const pctRemaining = totalDays > 0 ? Math.max(0, Math.min(1, daysRemaining / totalDays)) : 0

  const status: SupplyStatus =
    daysRemaining <= 0         ? 'critical'
    : (pctRemaining <= 0.25 || daysRemaining <= 10) ? 'low'
    : 'ok'

  const estimatedEndDate = new Date(
    new Date(params.orderDate).getTime() + totalDays * 86_400_000
  ).toISOString()

  return {
    productId: params.productId,
    productName: params.productName,
    unitsOrdered: params.unitsOrdered,
    orderDate: params.orderDate,
    totalDays,
    daysRemaining,
    pctRemaining,
    status,
    effectiveDrawMl,
    effectiveFrequency,
    hasOverride: !!(params.override?.draw_volume_ml != null || params.override?.frequency != null),
    reconstitutionMl: params.protocol.reconstitution_ml,
    cycleLengthWeeks: params.protocol.cycle_length_weeks ?? null,
    estimatedEndDate,
  }
}
