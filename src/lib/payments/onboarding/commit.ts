import type { AgentSupabase } from '@/lib/agent/types'
import { PAYMENT_LABELS, OFF_PLATFORM_METHODS } from '@/types/payments'
import { createPrivyWallet } from '@/lib/payments/privy'
import { validateAddress } from './validate'
import type { PaymentMethodsCommitInput, PaymentMethodsCommitResult } from './types'

interface CommitParams {
  supabase: AgentSupabase
  tenantId: string
  input: PaymentMethodsCommitInput
}

export async function commitPaymentMethods(params: CommitParams): Promise<PaymentMethodsCommitResult> {
  const { supabase, tenantId, input } = params

  console.log('[commitPaymentMethods] start', {
    tenantId,
    managed_crypto: input.managed_crypto,
    byo_crypto_count: input.byo_crypto.length,
    byo_crypto_types: input.byo_crypto.map(e => e.type),
    off_platform_count: input.off_platform.length,
    off_platform_types: input.off_platform.map(e => e.type),
  })

  if (!input.managed_crypto && input.byo_crypto.length === 0 && input.off_platform.length === 0) {
    throw new Error('commit failed: no payment methods to save')
  }

  for (const entry of input.byo_crypto) {
    const result = validateAddress(entry.type, entry.wallet_address)
    if (!result.ok) {
      throw new Error(`invalid address for ${PAYMENT_LABELS[entry.type]}: ${result.reason}`)
    }
  }

  for (const entry of input.off_platform) {
    if (!OFF_PLATFORM_METHODS.includes(entry.type)) {
      throw new Error(`${entry.type} is not an off-platform method`)
    }
    if (entry.instructions.trim() === '') {
      throw new Error(`instructions required for ${PAYMENT_LABELS[entry.type]}`)
    }
  }

  let managed_wallet_ready = false
  let managed_solana_address: string | null = null

  if (input.managed_crypto) {
    // Check before calling Privy — provisioning is idempotent at the DB level.
    const { data: existing } = await (supabase
      .from('tenant_crypto_wallets')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle() as unknown as Promise<{ data: { solana_address: string } | null }>)

    if (existing) {
      console.log('[commitPaymentMethods] managed wallet already exists', { tenantId, solana_address: existing.solana_address })
      managed_wallet_ready = true
      managed_solana_address = existing.solana_address
    } else {
      console.log('[commitPaymentMethods] provisioning Privy wallet', { tenantId })
      let privyWallet: { id: string; address: string }
      try {
        privyWallet = await createPrivyWallet()
        console.log('[commitPaymentMethods] Privy wallet created', { tenantId, privy_wallet_id: privyWallet.id, solana_address: privyWallet.address })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown error'
        console.error('[commitPaymentMethods] Privy provisioning failed', { tenantId, error: msg })
        throw new Error(`failed to provision managed wallet: ${msg}`)
      }

      const { error: walletErr } = await (supabase
        .from('tenant_crypto_wallets')
        .insert({
          tenant_id: tenantId,
          privy_wallet_id: privyWallet.id,
          solana_address: privyWallet.address,
        }) as unknown as Promise<{ error: { message: string } | null }>)

      if (walletErr) {
        console.error('[commitPaymentMethods] tenant_crypto_wallets insert failed', { tenantId, error: walletErr.message })
        throw new Error(`failed to provision managed wallet: ${walletErr.message}`)
      }

      console.log('[commitPaymentMethods] tenant_crypto_wallets row inserted', { tenantId })
      managed_wallet_ready = true
      managed_solana_address = privyWallet.address
    }
  } else {
    console.log('[commitPaymentMethods] managed_crypto is falsy — skipping Privy provisioning', { tenantId, value: input.managed_crypto })
  }

  const configRows = [
    ...input.byo_crypto.map(e => ({
      tenant_id:      tenantId,
      type:           e.type,
      wallet_address: e.wallet_address.trim(),
      instructions:   null as string | null,
    })),
    ...input.off_platform.map(e => ({
      tenant_id:      tenantId,
      type:           e.type,
      wallet_address: null as string | null,
      instructions:   e.instructions.trim(),
    })),
  ]

  if (configRows.length === 0) {
    console.log('[commitPaymentMethods] no payment config rows to insert (managed-only path)', { tenantId, managed_wallet_ready })
    return { configs_inserted: 0, managed_wallet_ready, managed_solana_address }
  }

  const { data: inserted, error: insertErr } = await (supabase
    .from('tenant_payment_configs')
    .insert(configRows)
    .select('id') as unknown as Promise<{ data: { id: string }[] | null; error: { message: string } | null }>)

  if (insertErr || !inserted) {
    console.error('[commitPaymentMethods] tenant_payment_configs insert failed', { tenantId, error: insertErr?.message, rows: configRows.length })
    throw new Error(insertErr?.message ?? 'Failed to insert payment configs')
  }

  console.log('[commitPaymentMethods] done', { tenantId, configs_inserted: inserted.length, managed_wallet_ready })

  return {
    configs_inserted: inserted.length,
    managed_wallet_ready,
    managed_solana_address,
  }
}
