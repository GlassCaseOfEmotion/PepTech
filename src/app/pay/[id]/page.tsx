import type { Metadata } from 'next'
import type { CheckoutData } from '@/types/payments-crypto'
import { CheckoutClient } from './CheckoutClient'

export const metadata: Metadata = { title: 'Pay · Peptech' }

export const dynamic = 'force-dynamic'

async function fetchCheckout(id: string): Promise<CheckoutData | null> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${appUrl}/api/pay/${id}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
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
