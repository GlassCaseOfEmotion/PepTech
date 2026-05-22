const BASE = 'https://api.nowpayments.io/v1'

function apiKey() {
  return process.env.NOWPAYMENTS_API_KEY ?? ''
}

export type CreatePaymentInput = {
  amountUsd: number
  payCurrency: string   // token customer pays in, e.g. 'btc', 'usdttrc20', 'eth'
  payoutAddress: string // tenant's Solana wallet — receives USDC after conversion
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
  const res = await fetch(`${BASE}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey() },
    body: JSON.stringify({
      price_amount:    input.amountUsd,
      price_currency:  'usd',
      pay_currency:    input.payCurrency,
      payout_currency: 'usdcsol',
      payout_address:  input.payoutAddress,
      order_id:        input.orderId,
      order_description: input.orderDescription,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`NOWPayments error ${res.status}: ${text}`)
  }
  const data = await res.json() as {
    payment_id: string
    payment_url: string
    expiration_estimate_date: string | null
  }
  return {
    id: String(data.payment_id),
    hostedUrl: data.payment_url,
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

// Currencies supported for customer payments in v1.
// NOWPayments pay_currency codes → display info.
export const PAY_CURRENCIES = [
  { id: 'usdttrc20', label: 'USDT', chain: 'TRC-20'  },
  { id: 'btc',       label: 'BTC',  chain: 'Mainnet' },
  { id: 'eth',       label: 'ETH',  chain: 'Mainnet' },
  { id: 'xmr',       label: 'XMR',  chain: 'Mainnet' },
  { id: 'sol',       label: 'SOL',  chain: 'Mainnet' },
  { id: 'usdterc20', label: 'USDT', chain: 'ERC-20'  },
  { id: 'ltc',       label: 'LTC',  chain: 'Mainnet' },
] as const

export type PayCurrencyId = typeof PAY_CURRENCIES[number]['id']
