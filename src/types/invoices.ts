export interface InvoiceItem {
  name: string
  sku: string
  qty: number
  unitPrice: number
  subtotal: number
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
  paymentAsset: string
  paymentAddress: string | null
}

export function formatInvoiceNumber(orderRef: string): string {
  return `INV-${orderRef}`
}

export function buildInvoiceData(
  order: {
    ref_number: string
    payment_asset: string
    payment_amount: number
    payment_address: string | null
    created_at: string
    customers: { display_name: string } | null
    order_items: { qty: number; unit_price_snapshot: number; products?: { name: string; sku: string } | null }[]
  },
  businessName: string,
  logoUrl: string | null,
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
    paymentAsset: order.payment_asset,
    paymentAddress: order.payment_address,
  }
}
