// src/app/payments/page.tsx
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { PaymentsView } from '@/components/payments/PaymentsView'
import { getWallet, getPaymentLinks } from './actions'
import type { CryptoPaymentLinkWithOrder } from '@/types/payments-crypto'

export default async function PaymentsPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [{ wallet, recentTransactions }, paymentLinks] = await Promise.all([
    getWallet(),
    getPaymentLinks(),
  ])

  return (
    <Shell section="Payments">
      <PaymentsView
        wallet={wallet}
        recentTransactions={recentTransactions}
        paymentLinks={paymentLinks}
      />
    </Shell>
  )
}
