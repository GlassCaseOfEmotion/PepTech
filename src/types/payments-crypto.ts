// src/types/payments-crypto.ts

export type CryptoPaymentStatus =
  | 'waiting'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'partially_paid'
  | 'finished'
  | 'failed'
  | 'refunded'
  | 'expired'

// Snake_case matches Supabase column names — no converter needed
export type TenantCryptoWallet = {
  id: string
  tenant_id: string
  privy_wallet_id: string
  solana_address: string
  balance_usdc: number
  created_at: string
  last_synced_at: string | null
}

export type CryptoPaymentLink = {
  id: string
  tenant_id: string
  order_id: string
  nowpayments_id: string
  hosted_url: string
  amount_usd: number       // USD sent to NOWPayments (always USD)
  amount_base: number | null  // amount in tenant's own currency (e.g. IDR)
  base_currency: string    // tenant's currency at time of creation (e.g. 'IDR')
  status: CryptoPaymentStatus
  payout_address: string
  memo: string | null
  pay_address: string | null        // blockchain address for customer to send crypto to
  pay_currency: string | null       // crypto code, e.g. 'btc', 'usdttrc20'
  pay_amount_crypto: number | null  // exact crypto amount locked at creation time
  created_at: string
  expires_at: string | null
  confirmed_at: string | null
  paid_token: string | null
  paid_amount: number | null
  usdc_received: number | null
  nowpayments_tx_id: string | null
}

// Returned by getPaymentLinks — includes joined order + customer + channel data
export type CryptoPaymentLinkWithOrder = CryptoPaymentLink & {
  orders: {
    ref_number: string
    conversation_id: string | null
    customers: {
      id: string
      display_name: string
      customer_channels: { channel_type: string; is_primary: boolean }[]
    } | null
  } | null
}

export type WalletTransaction = {
  id: string
  tenant_id: string
  crypto_payment_link_id: string | null
  amount_usdc: number
  solana_tx_signature: string | null
  source_token: string | null
  source_amount: number | null
  created_at: string
}

export type WalletBalanceResponse = {
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
}

// NOWPayments IPN webhook payload
export type NowPaymentsWebhookPayload = {
  payment_id: string
  payment_status: CryptoPaymentStatus
  pay_address: string
  price_amount: number
  price_currency: string
  pay_amount: number
  actually_paid: number
  pay_currency: string
  order_id: string
  outcome_amount: number | null
  outcome_currency: string | null
  nowpayments_fee: number | null
}

// Helius enhanced webhook transaction payload (minimal fields we need)
export type HeliusTransactionPayload = {
  signature: string
  tokenTransfers: {
    mint: string
    toUserAccount: string
    tokenAmount: number
  }[]
}

// Public data returned by GET /api/pay/[id] — no sensitive fields (no tenant_id, no payout_address)
export type CheckoutData = {
  id: string
  status: CryptoPaymentStatus
  amount_usd: number
  amount_base: number | null
  base_currency: string
  memo: string | null
  pay_address: string | null
  pay_currency: string | null
  pay_amount_crypto: number | null
  expires_at: string | null
  confirmed_at: string | null
  tenant_name: string
  order_ref: string
}
