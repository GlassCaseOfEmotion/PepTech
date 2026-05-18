export const LOW_THRESHOLD = 25
export const CRITICAL_THRESHOLD = 10
export const BAR_MAX = 200

export function stockFlag(stock: number): 'oos' | 'critical' | 'low' | undefined {
  if (stock === 0) return 'oos'
  if (stock <= CRITICAL_THRESHOLD) return 'critical'
  if (stock <= LOW_THRESHOLD) return 'low'
  return undefined
}
