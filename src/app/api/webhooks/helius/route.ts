import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { HeliusTransactionPayload } from '@/types/payments-crypto'

// USDC SPL token mint on Solana mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const expectedAuth = `Bearer ${process.env.HELIUS_WEBHOOK_SECRET ?? ''}`
  if (authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const transactions = await request.json() as HeliusTransactionPayload[]
  const supabase = createServiceClient()

  for (const tx of transactions) {
    for (const transfer of tx.tokenTransfers) {
      if (transfer.mint !== USDC_MINT) continue

      // Find the tenant wallet that received this transfer
      const { data: wallet } = await supabase
        .from('tenant_crypto_wallets')
        .select('id, tenant_id, balance_usdc')
        .eq('solana_address', transfer.toUserAccount)
        .single()
      if (!wallet) continue

      // Check if this signature is already recorded
      const { data: existing } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('solana_tx_signature', tx.signature)
        .single()
      if (existing) continue

      // Missed webhook — record the transaction and update balance
      await supabase.from('wallet_transactions').insert({
        tenant_id: wallet.tenant_id,
        amount_usdc: transfer.tokenAmount,
        solana_tx_signature: tx.signature,
        source_token: 'USDC',
        source_amount: transfer.tokenAmount,
      })

      await supabase.rpc('increment_wallet_balance', {
        p_tenant_id: wallet.tenant_id,
        p_amount: transfer.tokenAmount,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
