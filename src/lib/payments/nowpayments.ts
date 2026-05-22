const BASE = 'https://api.nowpayments.io/v1'

function apiKey() {
  return process.env.NOWPAYMENTS_API_KEY ?? ''
}

export type CreatePaymentInput = {
  amountUsd: number
  payoutAddress: string
  orderId: string
  orderDescription: string
}

export type CreatedPayment = {
  id: string
  hostedUrl: string
  expiresAt: string | null
}

export type NowPaymentStatus = {
  id: string
  payment_status: string
  pay_currency: string | null
  pay_amount: number | null
  actually_paid: number | null
  outcome_amount: number | null
  outcome_currency: string | null
}

export async function createNowPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
  // Use /invoice so the customer can choose their own payment currency on the hosted page.
  // /payment requires pay_currency upfront; /invoice does not.
  const res = await fetch(`${BASE}/invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey() },
    body: JSON.stringify({
      price_amount: input.amountUsd,
      price_currency: 'usd',
      payout_currency: 'usdcsol',
      payout_address: input.payoutAddress,
      order_id: input.orderId,
      order_description: input.orderDescription,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`NOWPayments error ${res.status}: ${text}`)
  }
  const data = await res.json() as {
    id: string
    invoice_url: string
    expiration_estimate_date: string | null
  }
  return {
    id: data.id,
    hostedUrl: data.invoice_url,
    expiresAt: data.expiration_estimate_date ?? null,
  }
}

export async function getNowPayment(paymentId: string): Promise<NowPaymentStatus> {
  const res = await fetch(`${BASE}/payment/${paymentId}`, {
    headers: { 'x-api-key': apiKey() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`NOWPayments error ${res.status}: ${text}`)
  }
  return res.json() as Promise<NowPaymentStatus>
}
