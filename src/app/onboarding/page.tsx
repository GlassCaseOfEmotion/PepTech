import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { OnboardingWizard } from './OnboardingWizard'

export default async function OnboardingPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) redirect('/login')

  const { data: tenant } = await supabase
    .from('tenants')
    .select('business_type, base_currency, onboarded_at')
    .eq('id', userRow.tenant_id)
    .single()

  if (tenant?.onboarded_at) redirect('/')

  const { count: productCount } = await supabase
    .from('products').select('id', { count: 'exact', head: true })

  // Resume at the right step based on what's already saved
  let initialStep = 1
  if (tenant?.business_type) initialStep = 3  // type set → skip to catalog step
  if ((productCount ?? 0) > 0) initialStep = 4 // catalog seeded → channel step

  return (
    <OnboardingWizard
      initialStep={initialStep}
      initialBusinessType={tenant?.business_type ?? null}
      initialCurrency={tenant?.base_currency ?? 'USD'}
      productCount={productCount ?? 0}
    />
  )
}
