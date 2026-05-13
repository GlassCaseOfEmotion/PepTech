import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { fetchAssetToBaseRate, STABLECOIN_ASSETS, COINGECKO_IDS } from '@/lib/currency'

const RATE_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function GET(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const asset = searchParams.get('asset') ?? ''
  const base  = searchParams.get('base')  ?? 'USD'

  if (!asset) return NextResponse.json({ error: 'asset param required' }, { status: 400 })
  if (!STABLECOIN_ASSETS.has(asset) && !COINGECKO_IDS[asset]) {
    return NextResponse.json({ error: `Unknown asset: ${asset}` }, { status: 400 })
  }
  if (base === 'USD' && STABLECOIN_ASSETS.has(asset)) {
    // Stablecoin in USD base — always 1:1, no API call needed
    return NextResponse.json({ rate: 1, asset, base })
  }

  const supabase = await createClient()

  const { data: cached } = await supabase
    .from('exchange_rates')
    .select('rate, fetched_at')
    .eq('from_currency', asset)
    .eq('to_currency', base)
    .single()

  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
    if (ageMs < RATE_TTL_MS) {
      return NextResponse.json({ rate: Number(cached.rate), asset, base })
    }
  }

  let rate: number
  try {
    rate = await fetchAssetToBaseRate(asset, base)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Rate fetch failed' },
      { status: 502 }
    )
  }

  await supabase.from('exchange_rates').upsert(
    { from_currency: asset, to_currency: base, rate, fetched_at: new Date().toISOString() },
    { onConflict: 'from_currency,to_currency' }
  )

  return NextResponse.json({ rate, asset, base })
}
