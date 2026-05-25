import { type PaymentType, PAYMENT_LABELS, OFF_PLATFORM_METHODS } from '@/types/payments'

const CHAIN_REGEX: Partial<Record<PaymentType, RegExp>> = {
  btc:        /^(bc1[a-z0-9]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
  eth:        /^0x[a-fA-F0-9]{40}$/,
  usdt_erc20: /^0x[a-fA-F0-9]{40}$/,
  usdc_erc20: /^0x[a-fA-F0-9]{40}$/,
  usdt_trc20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  sol:        /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  ltc:        /^(ltc1[a-z0-9]{8,87}|[LM3][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
  xmr:        /^[48][1-9A-HJ-NP-Za-km-z]{94}$/,
}

export function isCryptoType(type: PaymentType): boolean {
  return !OFF_PLATFORM_METHODS.includes(type)
}

export function validateAddress(
  type: PaymentType,
  address: string,
): { ok: true } | { ok: false; reason: string } {
  if (!isCryptoType(type)) {
    return { ok: false, reason: 'validateAddress should not be called for off-platform methods' }
  }

  const trimmed = address.trim()
  if (trimmed === '') {
    return { ok: false, reason: 'Address is empty' }
  }

  const regex = CHAIN_REGEX[type]
  if (!regex || !regex.test(trimmed)) {
    return { ok: false, reason: `Doesn't look like a valid ${PAYMENT_LABELS[type]} address` }
  }

  return { ok: true }
}
