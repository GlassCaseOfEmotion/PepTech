export type PaymentType =
  | 'usdt_trc20'
  | 'btc'
  | 'eth'
  | 'usdc_erc20'
  | 'ltc'
  | 'xmr'
  | 'bank_transfer'
  | 'cash'
  | 'customer_chooses'

export const PAYMENT_LABELS: Record<string, string> = {
  usdt_trc20:       'USDT (TRC20)',
  btc:              'BTC',
  eth:              'ETH',
  usdc_erc20:       'USDC (ERC20)',
  ltc:              'LTC',
  xmr:              'XMR',
  bank_transfer:    'Bank Transfer',
  cash:             'Cash',
  customer_chooses: 'Customer chooses',
}

// Ordered list shown in dropdowns and config UI (excludes cash + customer_chooses)
export const PAYMENT_METHODS: PaymentType[] = [
  'usdt_trc20', 'btc', 'eth', 'usdc_erc20', 'ltc', 'xmr', 'bank_transfer',
]

export interface TenantPaymentConfig {
  id: string
  tenant_id: string
  type: string
  wallet_address: string | null
  bank_name: string | null
  account_name: string | null
  account_number: string | null
  sort_code: string | null
  iban: string | null
  is_active: boolean
  created_at: string
}
