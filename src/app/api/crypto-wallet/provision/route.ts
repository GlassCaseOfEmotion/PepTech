// src/app/api/crypto-wallet/provision/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPrivyWallet } from '@/lib/payments/privy'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = userRow.tenant_id as string

  // Idempotent — return existing wallet if already provisioned
  const { data: existing } = await supabase
    .from('tenant_crypto_wallets').select('*').eq('tenant_id', tenantId).single()
  if (existing) return NextResponse.json(existing)

  // Create new Privy wallet
  let privyWallet
  try {
    privyWallet = await createPrivyWallet()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Privy error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { data, error } = await supabase
    .from('tenant_crypto_wallets')
    .insert({
      tenant_id: tenantId,
      privy_wallet_id: privyWallet.id,
      solana_address: privyWallet.address,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
