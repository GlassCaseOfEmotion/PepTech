const BASE = 'https://auth.privy.io/api/v1'

function authHeaders() {
  const appId = process.env.PRIVY_APP_ID ?? ''
  const secret = process.env.PRIVY_APP_SECRET ?? ''
  return {
    Authorization: 'Basic ' + Buffer.from(`${appId}:${secret}`).toString('base64'),
    'privy-app-id': appId,
  }
}

export type PrivyWallet = { id: string; address: string }

export async function createPrivyWallet(): Promise<PrivyWallet> {
  const res = await fetch(`${BASE}/wallets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ chain_type: 'solana' }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Privy error ${res.status}: ${text}`)
  }
  return res.json() as Promise<PrivyWallet>
}

export async function getPrivyWallet(walletId: string): Promise<PrivyWallet> {
  const res = await fetch(`${BASE}/wallets/${walletId}`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Privy error ${res.status}: ${text}`)
  }
  return res.json() as Promise<PrivyWallet>
}
