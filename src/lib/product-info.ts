import { FREQUENCY_LABELS } from '@/types/protocols'
import type { ProductProtocol, Frequency } from '@/types/protocols'

export type ProductInfoIncludes = { description: boolean; protocol: boolean; resources: boolean }

export function formatProductInfo(
  product: { name: string; sku: string; description: string | null; resources: { label: string; url: string }[] },
  protocol: ProductProtocol | null,
  include: ProductInfoIncludes,
): string {
  const parts: string[] = [`📋 ${product.name} (${product.sku})`]
  if (include.description && product.description) {
    parts.push('', product.description)
  }
  if (include.protocol && protocol) {
    const doses = Math.round(protocol.reconstitution_ml / protocol.draw_volume_ml)
    const lines: string[] = [
      `Reconstitution: Add ${protocol.reconstitution_ml}mL bacteriostatic water per vial`,
      `Draw volume: ${protocol.draw_volume_ml}mL per injection (${doses} doses/vial)`,
      `Frequency: ${FREQUENCY_LABELS[protocol.frequency as Frequency] ?? protocol.frequency}`,
    ]
    if (protocol.timing) lines.push(`Timing: ${protocol.timing}`)
    if (protocol.cycle_length_weeks) lines.push(`Cycle length: ${protocol.cycle_length_weeks} weeks`)
    if (protocol.storage) lines.push(`Storage: ${protocol.storage}`)
    if (protocol.notes) lines.push(`Notes: ${protocol.notes}`)
    parts.push('', '— Protocol —', ...lines)
  }
  if (include.resources && product.resources.length > 0) {
    parts.push('', '— Resources —')
    product.resources.forEach(r => parts.push(`${r.label}: ${r.url}`))
  }
  return parts.join('\n')
}
