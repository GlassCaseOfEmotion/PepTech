// src/lib/currency.ts

const LOCALE: Record<string, string> = { USD: 'en-US', IDR: 'id-ID' }
const DECIMALS: Record<string, number> = { USD: 2, IDR: 0 }

// Format a monetary amount for display using the browser/Node Intl API.
// Works in both client and server contexts.
export function formatAmount(amount: number, currency: string): string {
  const decimals = DECIMALS[currency] ?? 2
  return new Intl.NumberFormat(LOCALE[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(amount)
}

// Payment assets pegged 1:1 to USD — use fiat rate for conversion
export const STABLECOIN_ASSETS = new Set(['usdt_trc20', 'usdc_erc20'])

// CoinGecko IDs for volatile crypto assets — use crypto price feed
export const COINGECKO_IDS: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  ltc: 'litecoin',
  xmr: 'monero',
}

// Returns how many `to` units equal 1 `from` unit.
// e.g. fetchFiatRate('USD', 'IDR') → 16000
export async function fetchFiatRate(from: string, to: string): Promise<number> {
  if (from === to) return 1
  const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`)
  if (!res.ok) throw new Error(`Frankfurter error ${res.status}`)
  const data = await res.json() as { rates: Record<string, number> }
  const rate = data.rates[to]
  if (!rate) throw new Error(`No ${from}→${to} rate from Frankfurter`)
  return rate
}

// Returns how many `baseCurrency` units equal 1 unit of `paymentAsset`.
// e.g. fetchAssetToBaseRate('usdt_trc20', 'IDR') → 16000 (1 USDT = Rp 16,000)
// e.g. fetchAssetToBaseRate('btc', 'IDR') → 1_640_000_000 (1 BTC = Rp 1.64B)
export async function fetchAssetToBaseRate(paymentAsset: string, baseCurrency: string): Promise<number> {
  if (STABLECOIN_ASSETS.has(paymentAsset)) {
    // Stablecoins are USD-pegged — fetch fiat rate
    return fetchFiatRate('USD', baseCurrency)
  }
  const geckoId = COINGECKO_IDS[paymentAsset]
  if (!geckoId) throw new Error(`No CoinGecko mapping for: ${paymentAsset}`)
  const cur = baseCurrency.toLowerCase()
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=${cur}`
  )
  if (!res.ok) throw new Error(`CoinGecko error ${res.status}`)
  const data = await res.json() as Record<string, Record<string, number>>
  const rate = data[geckoId]?.[cur]
  if (!rate) throw new Error(`No CoinGecko rate for ${geckoId}/${cur}`)
  return rate
}
