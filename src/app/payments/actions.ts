'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TenantCryptoWallet, CryptoPaymentLink, CryptoPaymentLinkWithOrder, WalletTransaction } from '@/types/payments-crypto'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string }
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
        customers (
          display_name,
          display_handle
        )
      )
    `)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as CryptoPaymentLinkWithOrder[]
}

export async function lookupOrder(query: string): Promise<{
  orders?: { id: string; ref_number: string; payment_amount: number; customer_name: string | null; customer_handle: string | null }[]
  error?: string
}> {
  if (!query.trim()) return { orders: [] }
  try {
    const { supabase } = await getTenantId()
    const { data, error } = await supabase
      .from('orders')
      .select('id, ref_number, payment_amount, customers(display_name, display_handle)')
      .ilike('ref_number', `%${query.trim()}%`)
      .limit(5)
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = (data ?? []).map((o: any) => ({
      id: o.id,
      ref_number: o.ref_number,
      payment_amount: Number(o.payment_amount),
      customer_name: o.customers?.display_name ?? null,
      customer_handle: o.customers?.display_handle ?? null,
    }))
    return { orders }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function createPaymentLink(orderId: string, memo?: string): Promise<{
  link?: CryptoPaymentLink
  error?: string
}> {
  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: order } = await supabase
      .from('orders')
      .select('id, ref_number, payment_amount')
      .eq('id', orderId)
      .single()
    if (!order) return { error: 'Order not found' }

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
      amountUsd: Number(order.payment_amount),
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
      amount_usd: Number(order.payment_amount),
      payout_address: wallet.solana_address,
      expires_at: payment.expiresAt,
      memo: memo ?? order.ref_number,
    }
    const { data, error } = await supabase
      .from('crypto_payment_links')
      .insert(insertRow)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/payments')
    return { link: data as CryptoPaymentLink }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
