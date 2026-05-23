'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TenantCryptoWallet, CryptoPaymentLink, CryptoPaymentLinkWithOrder, WalletTransaction } from '@/types/payments-crypto'
import { fetchFiatRate } from '@/lib/currency'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string }
}

// Returns IDR-per-USD (or equivalent) rate, using cached exchange_rates with 1-hour TTL.
// e.g. for 'IDR': returns ~16000, meaning 1 USD = 16,000 IDR.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUsdToBaseRate(supabase: any, baseCurrency: string): Promise<number> {
  if (baseCurrency === 'USD') return 1

  const { data: cached } = await supabase
    .from('exchange_rates')
    .select('rate, fetched_at')
    .eq('from_currency', 'USD')
    .eq('to_currency', baseCurrency)
    .single()

  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
    if (ageMs < 3600_000) return Number(cached.rate)
  }

  const rate = await fetchFiatRate('USD', baseCurrency)
  await supabase.from('exchange_rates').upsert(
    { from_currency: 'USD', to_currency: baseCurrency, rate, fetched_at: new Date().toISOString() },
    { onConflict: 'from_currency,to_currency' }
  )
  return rate
}

// ── Public actions ────────────────────────────────────────────────────────────

export async function getTenantCurrency(): Promise<string> {
  const { supabase, tenantId } = await getTenantId()
  const { data } = await supabase.from('tenants').select('base_currency').eq('id', tenantId).single()
  return (data?.base_currency as string | null) ?? 'USD'
}

export async function estimateUsd(amountBase: number, fromCurrency: string): Promise<{
  amountUsd?: number
  rate?: number
  error?: string
}> {
  if (fromCurrency === 'USD') return { amountUsd: amountBase, rate: 1 }
  try {
    const { supabase } = await getTenantId()
    const rate = await getUsdToBaseRate(supabase, fromCurrency)
    const amountUsd = Math.round((amountBase / rate) * 100) / 100
    return { amountUsd, rate }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Rate fetch failed' }
  }
}

export async function getWallet(): Promise<{
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
}> {
  const { supabase } = await getTenantId()
  const { data: wallet } = await supabase
    .from('tenant_crypto_wallets').select('*').single()
  const { data: txs } = await supabase
    .from('wallet_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  return {
    wallet: wallet as TenantCryptoWallet | null,
    recentTransactions: (txs ?? []) as WalletTransaction[],
  }
}

export async function getPaymentLinks(): Promise<CryptoPaymentLinkWithOrder[]> {
  const { supabase } = await getTenantId()
  const { data } = await supabase
    .from('crypto_payment_links')
    .select(`
      *,
      orders (
        ref_number,
        customers ( display_name )
      )
    `)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as CryptoPaymentLinkWithOrder[]
}

export async function getRecentOrders(): Promise<{
  orders?: { id: string; ref_number: string; payment_amount: number; currency: string; customer_name: string | null }[]
  error?: string
}> {
  try {
    const { supabase } = await getTenantId()
    const { data, error } = await supabase
      .from('orders')
      .select('id, ref_number, payment_amount, currency, customers(display_name)')
      .not('status', 'eq', 'cancelled')
      .gt('payment_amount', 0)
      .order('created_at', { ascending: false })
      .limit(8)
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = (data ?? []).map((o: any) => ({
      id: o.id,
      ref_number: o.ref_number,
      payment_amount: Number(o.payment_amount),
      currency: o.currency ?? 'USD',
      customer_name: o.customers?.display_name ?? null,
    }))
    return { orders }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function lookupOrder(query: string): Promise<{
  orders?: { id: string; ref_number: string; payment_amount: number; currency: string; customer_name: string | null }[]
  error?: string
}> {
  if (!query.trim()) return { orders: [] }
  try {
    const { supabase } = await getTenantId()
    const { data, error } = await supabase
      .from('orders')
      .select('id, ref_number, payment_amount, currency, customers(display_name)')
      .ilike('ref_number', `%${query.trim()}%`)
      .limit(5)
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = (data ?? []).map((o: any) => ({
      id: o.id,
      ref_number: o.ref_number,
      payment_amount: Number(o.payment_amount),
      currency: o.currency ?? 'USD',
      customer_name: o.customers?.display_name ?? null,
    }))
    return { orders }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function createPaymentLink(orderId: string, payCurrency: string, memo?: string): Promise<{
  link?: CryptoPaymentLink
  error?: string
}> {
  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: order } = await supabase
      .from('orders')
      .select('id, ref_number, payment_amount, currency')
      .eq('id', orderId)
      .single()
    if (!order) return { error: 'Order not found' }

    const orderCurrency: string = (order.currency as string | null) ?? 'USD'
    const amountBase = Number(order.payment_amount)

    // Convert to USD for NOWPayments (gateway always expects USD)
    let amountUsd = amountBase
    if (orderCurrency !== 'USD') {
      const rate = await getUsdToBaseRate(supabase, orderCurrency)
      amountUsd = Math.round((amountBase / rate) * 100) / 100
      if (amountUsd < 1) {
        return { error: `Amount too small after currency conversion ($${amountUsd.toFixed(2)} USD — minimum is $1.00)` }
      }
    }

    let wallet = (await supabase
      .from('tenant_crypto_wallets').select('*').eq('tenant_id', tenantId).single()).data

    if (!wallet) {
      const { createPrivyWallet } = await import('@/lib/payments/privy')
      const privyWallet = await createPrivyWallet()
      const { data: newWallet } = await supabase
        .from('tenant_crypto_wallets')
        .insert({
          tenant_id: tenantId,
          privy_wallet_id: privyWallet.id,
          solana_address: privyWallet.address,
        })
        .select()
        .single()
      wallet = newWallet
    }

    if (!wallet) return { error: 'Could not provision wallet' }

    const { createNowPayment } = await import('@/lib/payments/nowpayments')
    const payment = await createNowPayment({
      amountUsd,
      payCurrency,
      payoutAddress: wallet.solana_address,
      orderId: order.id,
      orderDescription: memo ?? order.ref_number,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertRow: any = {
      tenant_id: tenantId,
      order_id: order.id,
      nowpayments_id: payment.id,
      hosted_url: payment.hostedUrl,
      amount_usd: amountUsd,
      amount_base: amountBase,
      base_currency: orderCurrency,
      payout_address: wallet.solana_address,
      expires_at: payment.expiresAt,
      memo: memo ?? order.ref_number,
    }
    const { data, error } = await supabase
      .from('crypto_payment_links')
      .insert(insertRow)
      .select()
      .single()

    if (error) {
      console.error('[createPaymentLink] DB insert failed:', error.message)
      return { error: error.message }
    }

    revalidatePath('/payments')
    return { link: data as CryptoPaymentLink }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error('[createPaymentLink] Unhandled error:', msg)
    return { error: msg }
  }
}
