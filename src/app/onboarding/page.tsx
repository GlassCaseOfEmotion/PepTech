import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { OnboardingWizard } from './OnboardingWizard'

export default async function OnboardingPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: userRow } = await supabase
    .from('users').select('tenant_id, display_name').eq('id', user.id).single()
  if (!userRow) redirect('/login')

  const { data: tenant } = await supabase
    .from('tenants')
    .select('business_type, base_currency, onboarded_at, name')
    .eq('id', userRow.tenant_id)
    .single()

  if (tenant?.onboarded_at) redirect('/')

  const { count: productCount } = await supabase
    .from('products').select('id', { count: 'exact', head: true })

  // Step 0 = welcome (fresh start). Skip ahead if already partially completed.
  let initialStep = 0
  if (tenant?.business_type) initialStep = 3
  if ((productCount ?? 0) > 0) initialStep = 4

  return (
    <OnboardingWizard
      initialStep={initialStep}
      initialBusinessType={tenant?.business_type ?? null}
      initialCurrency={tenant?.base_currency ?? 'USD'}
      productCount={productCount ?? 0}
      businessName={tenant?.name ?? 'Your Business'}
      displayName={userRow?.display_name ?? ''}
    />
  )
}
