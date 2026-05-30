import { createClient, getServerUser } from './supabase/server'

export interface TenantBrand {
  tenantName: string | null
  tenantLogoUrl: string | null
}

/** Server-side fetch for the current user's tenant brand (name + public
 * logo URL). The `logos` bucket is public, so getPublicUrl is sync — no
 * storage API round-trip. Used by both Shell and ShellSkeleton so the
 * skeleton paints with the same workspace brand as the eventual page
 * (no flash of Peptech default while loading). */
export async function getTenantBrand(): Promise<TenantBrand> {
  try {
    const user = await getServerUser()
    if (!user) return { tenantName: null, tenantLogoUrl: null }
    const supabase = await createClient()
    const { data: userRow } = await supabase
      .from('users')
      .select('tenants(name, logo_path)')
      .eq('id', user.id)
      .single()
    const tenant = (userRow as { tenants?: { name: string; logo_path: string | null } | null } | null)?.tenants ?? null
    if (!tenant) return { tenantName: null, tenantLogoUrl: null }
    const tenantLogoUrl = tenant.logo_path
      ? supabase.storage.from('logos').getPublicUrl(
          tenant.logo_path,
          { transform: { width: 96, height: 96, quality: 80, resize: 'cover' } },
        ).data.publicUrl
      : null
    return { tenantName: tenant.name, tenantLogoUrl }
  } catch {
    return { tenantName: null, tenantLogoUrl: null }
  }
}
