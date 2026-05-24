import { permanentRedirect } from 'next/navigation'

export default async function CustomerDetailRedirect({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params
  permanentRedirect(`/contacts/${customerId}`)
}
