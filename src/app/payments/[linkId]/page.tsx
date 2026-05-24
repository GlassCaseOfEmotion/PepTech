import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { PaymentLinkDetail } from '@/components/payments/PaymentLinkDetail'
import { getPaymentLink } from '../actions'

export default async function PaymentLinkDetailPage({
  params,
}: {
  params: Promise<{ linkId: string }>
}) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const { linkId } = await params
  const link = await getPaymentLink(linkId)
  if (!link) redirect('/payments')

  return (
    <Shell section="Payments">
      <PaymentLinkDetail link={link} />
    </Shell>
  )
}
