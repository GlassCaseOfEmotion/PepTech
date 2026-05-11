import { PAYMENT_LABELS } from '@/types/payments'
import type { TenantPaymentConfig, PaymentType } from '@/types/payments'

interface OrderPaymentInfo {
  ref_number: string
  payment_amount: number
  payment_asset: string
  payment_address: string | null
}

export function buildPaymentMessage(
  order: OrderPaymentInfo,
  configs: TenantPaymentConfig[],
): string {
  if (order.payment_asset === 'cash') return ''

  const amount = `$${order.payment_amount.toFixed(2)}`
  const header = `Payment details for order ${order.ref_number} · ${amount}`

  if (order.payment_asset === 'customer_chooses') {
    const active = configs.filter(c => c.is_active && c.type !== 'cash')
    const lines = active.map(c => {
      if (c.type === 'bank_transfer') {
        const parts: string[] = []
        if (c.account_name) parts.push(c.account_name)
        if (c.account_number) parts.push(c.account_number)
        if (c.sort_code) parts.push(`Sort: ${c.sort_code}`)
        else if (c.iban) parts.push(`IBAN: ${c.iban}`)
        parts.push(`Ref: ${order.ref_number}`)
        return `Bank Transfer: ${parts.join(' · ')}`
      }
      return `${PAYMENT_LABELS[c.type as PaymentType] ?? c.type}: ${c.wallet_address}`
    })
    const hasBankTransfer = active.some(c => c.type === 'bank_transfer')
    const note = hasBankTransfer ? '\n\nPlease include the reference number for bank transfers.' : ''
    return `${header}\n\n${lines.join('\n')}${note}`
  }

  if (order.payment_asset === 'bank_transfer') {
    const cfg = configs.find(c => c.type === 'bank_transfer')
    if (!cfg) return `${header}\n\nBank transfer — contact us for details.`
    const lines = [
      'Bank Transfer:',
      `  Name: ${cfg.account_name}`,
      cfg.account_number ? `  Account: ${cfg.account_number}` : null,
      cfg.sort_code ? `  Sort code: ${cfg.sort_code}` : null,
      cfg.iban ? `  IBAN: ${cfg.iban}` : null,
      `  Reference: ${order.ref_number} (please include this)`,
    ].filter(Boolean)
    return `${header}\n\n${lines.join('\n')}`
  }

  if (!order.payment_address) {
    return `${header}\n\nPayment details unavailable — contact the operator.`
  }
  const label = PAYMENT_LABELS[order.payment_asset as PaymentType] ?? order.payment_asset
  return `${header}\n\n${label}: ${order.payment_address}\n\nPlease send the exact amount shown on the invoice.`
}
