'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TenantCryptoWallet, CryptoPaymentLink, WalletTransaction } from '@/types/payments-crypto'

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

export async function getPaymentLinks(): Promise<CryptoPaymentLink[]> {
  const { supabase } = await getTenantId()
  const { data } = await supabase
    .from('crypto_payment_links')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as CryptoPaymentLink[]
}

export async function createPaymentLink(orderId: string): Promise<{
  link?: CryptoPaymentLink
  error?: string
}> {
  try {
    const { supabase, tenantId } = await getTenantId()

    // Verify order belongs to this tenant
    const { data: order } = await supabase
      .from('orders')
      .select('id, ref_number, payment_amount')
      .eq('id', orderId)
      .single()
    if (!order) return { error: 'Order not found' }

    // Provision wallet lazily
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
      orderDescription: order.ref_number,
    })

    const { data, error } = await supabase
      .from('crypto_payment_links')
      .insert({
        tenant_id: tenantId,
        order_id: order.id,
        nowpayments_id: payment.id,
        hosted_url: payment.hostedUrl,
        amount_usd: Number(order.payment_amount),
        payout_address: wallet.solana_address,
        expires_at: payment.expiresAt,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/payments')
    return { link: data as CryptoPaymentLink }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
