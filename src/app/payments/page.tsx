// src/app/payments/page.tsx
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { PaymentsView } from '@/components/payments/PaymentsView'
import { getWallet, getPaymentLinks, getTenantCurrency } from './actions'

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>
}) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const { create: initialOrderId } = await searchParams

  const [{ wallet, recentTransactions }, paymentLinks, baseCurrency] = await Promise.all([
    getWallet(),
    getPaymentLinks(),
    getTenantCurrency(),
  ])

  return (
    <Shell section="Payments">
      <PaymentsView
        wallet={wallet}
        recentTransactions={recentTransactions}
        paymentLinks={paymentLinks}
        baseCurrency={baseCurrency}
        initialOrderId={initialOrderId ?? null}
      />
    </Shell>
  )
}
