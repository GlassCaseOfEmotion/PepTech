import { PAYMENT_LABELS } from '@/types/payments'
import type { TenantPaymentConfig, PaymentType } from '@/types/payments'

interface OrderPaymentInfo {
  ref_number: string
  payment_amount: number
  payment_asset: string
  payment_address: string | null
}

export const CRYPTO_ASSETS = new Set([
  'usdt_trc20', 'usdt_erc20', 'btc', 'eth', 'usdc_erc20', 'ltc', 'xmr', 'sol',
])

export function buildPaymentMessage(
  order: OrderPaymentInfo,
  configs: TenantPaymentConfig[],
  checkoutUrl?: string,
): string {
  if (order.payment_asset === 'cash') return ''

  const amount = `$${order.payment_amount.toFixed(2)}`
  const header = `Payment details for order ${order.ref_number} · ${amount}`

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

  if (CRYPTO_ASSETS.has(order.payment_asset)) {
    const label = PAYMENT_LABELS[order.payment_asset as PaymentType] ?? order.payment_asset
    if (checkoutUrl) {
      return `${header}\n\nPay with ${label} via secure checkout:\n${checkoutUrl}`
    }
    if (!order.payment_address) {
      return `${header}\n\nPayment details unavailable — contact the operator.`
    }
    return `${header}\n\n${label}: ${order.payment_address}\n\nPlease send the exact amount shown on the invoice.`
  }

  return `${header}\n\nPayment details unavailable — contact the operator.`
}
