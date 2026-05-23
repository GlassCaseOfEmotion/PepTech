import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import type { CheckoutData } from '@/types/payments-crypto'
import { CheckoutClient } from './CheckoutClient'

export const metadata: Metadata = { title: 'Pay · Peptech' }

export const dynamic = 'force-dynamic'

async function fetchCheckout(id: string): Promise<CheckoutData | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('crypto_payment_links')
    .select(`
      id, status, amount_usd, amount_base, base_currency, memo,
      pay_address, pay_currency, pay_amount_crypto, expires_at, confirmed_at,
      orders ( ref_number ),
      tenants ( name )
    `)
    .eq('id', id)
    .single()
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  return {
    id: d.id,
    status: d.status,
    amount_usd: Number(d.amount_usd),
    amount_base: d.amount_base !== null ? Number(d.amount_base) : null,
    base_currency: d.base_currency,
    memo: d.memo,
    pay_address: d.pay_address,
    pay_currency: d.pay_currency,
    pay_amount_crypto: d.pay_amount_crypto !== null ? Number(d.pay_amount_crypto) : null,
    expires_at: d.expires_at,
    confirmed_at: d.confirmed_at,
    tenant_name: d.tenants?.name ?? 'Merchant',
    order_ref: d.orders?.ref_number ?? '',
  }
}

export default async function PayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await fetchCheckout(id)

  if (!data) {
    return (
      <div className="pay-cust-frame">
        <div className="pay-cust-card">
          <div className="pay-cust-no-addr" style={{ padding: '48px 24px' }}>
            Payment link not found or has expired.
          </div>
        </div>
      </div>
    )
  }

  return <CheckoutClient initial={data} />
}
