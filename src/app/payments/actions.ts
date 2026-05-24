'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createOrFindConversation } from '@/app/inbox/actions'
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
        status,
        conversation_id,
        customers (
          id,
          display_name,
          customer_channels ( channel_type, is_primary )
        )
      )
    `)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as CryptoPaymentLinkWithOrder[]
}

export async function getPaymentLink(linkId: string): Promise<CryptoPaymentLinkWithOrder | null> {
  const { supabase } = await getTenantId()
  const { data } = await supabase
    .from('crypto_payment_links')
    .select(`
      *,
      orders (
        ref_number,
        status,
        conversation_id,
        customers (
          id,
          display_name,
          customer_channels ( channel_type, is_primary )
        )
      )
    `)
    .eq('id', linkId)
    .single()
  return (data ?? null) as unknown as CryptoPaymentLinkWithOrder | null
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

export async function getOrderById(orderId: string): Promise<{
  order?: { id: string; ref_number: string; payment_amount: number; currency: string; customer_name: string | null }
  error?: string
}> {
  try {
    const { supabase } = await getTenantId()
    const { data, error } = await supabase
      .from('orders')
      .select('id, ref_number, payment_amount, currency, customers(display_name)')
      .eq('id', orderId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: 'Order not found' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    return { order: {
      id: d.id,
      ref_number: d.ref_number,
      payment_amount: Number(d.payment_amount),
      currency: d.currency ?? 'USD',
      customer_name: d.customers?.display_name ?? null,
    }}
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

export async function getOrderChannel(orderId: string): Promise<{
  customerId: string | null
  channelType: string | null
  customerName: string | null
}> {
  try {
    const { supabase } = await getTenantId()
    const { data } = await supabase
      .from('orders')
      .select('customer_id, customers(display_name, customer_channels(channel_type, is_primary))')
      .eq('id', orderId)
      .single()
    if (!data) return { customerId: null, channelType: null, customerName: null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    const channels: { channel_type: string; is_primary: boolean }[] = d.customers?.customer_channels ?? []
    const primary = channels.find((c: { channel_type: string; is_primary: boolean }) => c.is_primary) ?? channels[0] ?? null
    return {
      customerId: d.customer_id ?? null,
      channelType: primary?.channel_type ?? null,
      customerName: d.customers?.display_name ?? null,
    }
  } catch {
    return { customerId: null, channelType: null, customerName: null }
  }
}

export async function markOrderAwaiting(orderId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const { supabase } = await getTenantId()
    const { error } = await supabase
      .from('orders')
      .update({ status: 'awaiting' })
      .eq('id', orderId)
      .eq('status', 'created')
    if (error) return { error: error.message }
    revalidatePath('/orders')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function cancelPaymentLink(linkId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('crypto_payment_links')
      .update({ status: 'expired' })
      .eq('id', linkId)
      .eq('tenant_id', tenantId)
      .in('status', ['waiting'])  // only cancel if still waiting; ignore if already progressed
    if (error) return { error: error.message }
    revalidatePath('/payments')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function sendPaymentLinkToCustomer(
  customerId: string,
  channelType: string,
  messageText: string,
  orderId?: string,
  linkId?: string
): Promise<{ ok: true; conversationId: string } | { error: string }> {
  try {
    // Find or create a conversation for this customer + channel
    const result = await createOrFindConversation(customerId, channelType)
    if ('error' in result) return { error: result.error }
    const { conversationId } = result

    const cookieStore = await cookies()
    const cookieHeader = cookieStore.getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ')
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const res = await fetch(`${baseUrl}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ conversationId, content: messageText }),
    })
    if (!res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await res.json().catch(() => ({} as any))
      return { error: (body.error as string) ?? `Send failed (${res.status})` }
    }
    if (orderId) await markOrderAwaiting(orderId)
    if (linkId) {
      const { supabase, tenantId } = await getTenantId()
      const { error: sentViaErr } = await supabase.from('crypto_payment_links')
        .update({ sent_via: channelType })
        .eq('id', linkId)
        .eq('tenant_id', tenantId)
      if (sentViaErr) console.error('[sent_via update]', sentViaErr)
      revalidatePath('/payments')
    }
    return { ok: true, conversationId }
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

    const linkId = crypto.randomUUID()
    const payBaseUrl = process.env.NEXT_PUBLIC_PAY_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://peptech.app'
    const hostedUrl = `${payBaseUrl}/pay/${linkId}`

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
      id: linkId,
      tenant_id: tenantId,
      order_id: order.id,
      nowpayments_id: payment.id,
      hosted_url: hostedUrl,
      amount_usd: amountUsd,
      amount_base: amountBase,
      base_currency: orderCurrency,
      payout_address: wallet.solana_address,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      memo: memo ?? order.ref_number,
      pay_address: payment.payAddress || null,
      pay_currency: payment.payCurrency || null,
      pay_amount_crypto: payment.payCryptoAmount || null,
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
