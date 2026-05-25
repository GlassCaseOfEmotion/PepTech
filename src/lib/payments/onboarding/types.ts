import type { PaymentType } from '@/types/payments'

export interface ByoCryptoEntry {
  type: PaymentType        // must be a crypto type (caller responsibility)
  wallet_address: string
}

export interface OffPlatformEntry {
  type: PaymentType        // must be an off-platform type
  instructions: string
}

export interface PaymentMethodsCommitInput {
  managed_crypto: boolean
  byo_crypto: ByoCryptoEntry[]
  off_platform: OffPlatformEntry[]
}

export interface PaymentMethodsCommitResult {
  /** Number of tenant_payment_configs rows inserted. */
  configs_inserted: number
  /** Whether a tenant_crypto_wallets row exists for this tenant post-commit. */
  managed_wallet_ready: boolean
  /** The Solana address if managed_wallet_ready is true. */
  managed_solana_address: string | null
}
