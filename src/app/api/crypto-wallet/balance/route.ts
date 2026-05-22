// src/app/api/crypto-wallet/balance/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = userRow.tenant_id as string

  const { data: wallet } = await supabase
    .from('tenant_crypto_wallets').select('*').eq('tenant_id', tenantId).single()
  if (!wallet) return NextResponse.json({ wallet: null, recentTransactions: [] })

  const { data: txs } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ wallet, recentTransactions: txs ?? [] })
}
