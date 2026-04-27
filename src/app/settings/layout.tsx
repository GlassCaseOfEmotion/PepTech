import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { SettingsNav } from '@/components/settings/SettingsNav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'

  return (
    <Shell section="Settings">
      <div className="pt-st">
        <div className="pt-st-hd">
          <div>
            <h1>Settings</h1>
            <p>Account, channels, wallets, and operator preferences.</p>
          </div>
        </div>
        <div className="pt-st-body">
          <SettingsNav displayName={displayName} />
          <div className="pt-st-pane">
            {children}
          </div>
        </div>
      </div>
    </Shell>
  )
}
