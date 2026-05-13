import type { TenantPaymentConfig } from './payments'
import { PAYMENT_LABELS } from './payments'

export interface InvoiceItem {
  name: string
  sku: string
  qty: number
  unitPrice: number
  subtotal: number
}

export interface InvoicePaymentMethod {
  label: string
  address?: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  sortCode?: string
  iban?: string
  reference?: string
}

export interface InvoiceData {
  invoiceNumber: string
  orderRef: string
  issuedAt: string
  businessName: string
  logoUrl: string | null
  customerName: string
  items: InvoiceItem[]
  total: number
  currency: string
  paymentMethods: InvoicePaymentMethod[]
}

export function formatInvoiceNumber(orderRef: string): string {
  return `INV-${orderRef}`
}

export function buildInvoiceData(
  order: {
    ref_number: string
    payment_asset: string
    payment_amount: number
    currency?: string
    payment_address: string | null
    created_at: string
    customers: { display_name: string } | null
    order_items: { qty: number; unit_price_snapshot: number; products?: { name: string; sku: string } | null }[]
  },
  businessName: string,
  logoUrl: string | null,
  configs: TenantPaymentConfig[] = [],
): InvoiceData {
  const items: InvoiceItem[] = order.order_items.map(it => ({
    name: it.products?.name ?? 'Product',
    sku:  it.products?.sku  ?? '—',
    qty: it.qty,
    unitPrice: it.unit_price_snapshot,
    subtotal: it.qty * it.unit_price_snapshot,
  }))

  return {
    invoiceNumber: formatInvoiceNumber(order.ref_number),
    orderRef: order.ref_number,
    issuedAt: new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    businessName,
    logoUrl,
    customerName: order.customers?.display_name ?? 'Customer',
    items,
    total: items.reduce((s, it) => s + it.subtotal, 0),
    currency: order.currency ?? 'USD',
    paymentMethods: buildInvoicePaymentMethods(order, configs),
  }
}

function buildInvoicePaymentMethods(
  order: { payment_asset: string; payment_address: string | null; ref_number: string },
  configs: TenantPaymentConfig[],
): InvoicePaymentMethod[] {
  if (order.payment_asset === 'cash') return []

  if (order.payment_asset === 'customer_chooses') {
    return configs
      .filter(c => c.is_active && c.type !== 'cash')
      .map(c => configToInvoiceMethod(c, order.ref_number))
  }

  if (order.payment_asset === 'bank_transfer') {
    const cfg = configs.find(c => c.type === 'bank_transfer')
    if (!cfg) return [{ label: 'Bank Transfer', reference: order.ref_number }]
    return [configToInvoiceMethod(cfg, order.ref_number)]
  }

  return [{
    label: PAYMENT_LABELS[order.payment_asset as keyof typeof PAYMENT_LABELS] ?? order.payment_asset,
    address: order.payment_address ?? undefined,
  }]
}

function configToInvoiceMethod(c: TenantPaymentConfig, refNumber: string): InvoicePaymentMethod {
  if (c.type === 'bank_transfer') {
    return {
      label: 'Bank Transfer',
      bankName: c.bank_name ?? undefined,
      accountName: c.account_name ?? undefined,
      accountNumber: c.account_number ?? undefined,
      sortCode: c.sort_code ?? undefined,
      iban: c.iban ?? undefined,
      reference: refNumber,
    }
  }
  return {
    label: PAYMENT_LABELS[c.type as keyof typeof PAYMENT_LABELS] ?? c.type,
    address: c.wallet_address ?? undefined,
  }
}
