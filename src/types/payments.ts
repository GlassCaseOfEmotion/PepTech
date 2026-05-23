export type PaymentType =
  | 'usdt_trc20'
  | 'usdt_erc20'
  | 'btc'
  | 'eth'
  | 'usdc_erc20'
  | 'ltc'
  | 'xmr'
  | 'sol'
  | 'bank_transfer'
  | 'cash'
  | 'customer_chooses'

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  usdt_trc20:       'USDT (TRC20)',
  usdt_erc20:       'USDT (ERC20)',
  btc:              'BTC',
  eth:              'ETH',
  usdc_erc20:       'USDC (ERC20)',
  ltc:              'LTC',
  xmr:              'XMR',
  sol:              'SOL',
  bank_transfer:    'Bank Transfer',
  cash:             'Cash',
  customer_chooses: 'Customer chooses',
}

// Short label + CSS data-asset key for coloured badges
export const PAYMENT_BADGE: Record<string, { label: string; key: string }> = {
  usdt_trc20:       { label: 'USDT',  key: 'usdt'  },
  usdt_erc20:       { label: 'USDT',  key: 'usdt'  },
  btc:              { label: 'BTC',   key: 'btc'   },
  eth:              { label: 'ETH',   key: 'eth'   },
  usdc_erc20:       { label: 'USDC',  key: 'usdc'  },
  ltc:              { label: 'LTC',   key: 'ltc'   },
  xmr:              { label: 'XMR',   key: 'xmr'   },
  sol:              { label: 'SOL',   key: 'sol'   },
  bank_transfer:    { label: 'Bank',  key: 'bank'  },
  customer_chooses: { label: 'Multi', key: 'multi' },
  cash:             { label: 'Cash',  key: 'cash'  },
  // legacy casing
  USDT:  { label: 'USDT',  key: 'usdt'  },
  BTC:   { label: 'BTC',   key: 'btc'   },
  Cash:  { label: 'Cash',  key: 'cash'  },
  Other: { label: 'Other', key: 'other' },
}

// Ordered list shown in dropdowns and config UI (excludes cash + customer_chooses)
export const PAYMENT_METHODS: PaymentType[] = [
  'usdt_trc20', 'usdt_erc20', 'btc', 'eth', 'usdc_erc20', 'ltc', 'xmr', 'sol', 'bank_transfer',
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
