import { createClient, getServerUser } from '@/lib/supabase/server'
import { BrandingForm } from './BrandingForm'

export default async function BrandingPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user!.id).single()
  const { data: tenant } = await supabase.from('tenants').select('name, logo_path').eq('id', userRow!.tenant_id).single()

  let logoUrl: string | null = null
  if (tenant?.logo_path) {
    const { data: signed } = await supabase.storage.from('logos').createSignedUrl(tenant.logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Branding</h2>
          <p>Logo and business name shown on customer invoices.</p>
        </div>
      </div>
      <BrandingForm businessName={tenant?.name ?? ''} logoUrl={logoUrl} />
    </div>
  )
}
