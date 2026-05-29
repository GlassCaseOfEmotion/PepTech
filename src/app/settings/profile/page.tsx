import { createClient, getServerUser } from '@/lib/supabase/server'
import { initials } from '@/types/inbox'
import { CopilotToggle } from './CopilotToggle'

export default async function ProfilePage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: userRow } = await supabase
    .from('users')
    .select('display_name, tenant_id')
    .eq('id', user!.id)
    .single()

  const displayName = userRow?.display_name ?? user?.email?.split('@')[0] ?? 'User'

  const { data: tenantRow } = userRow?.tenant_id
    ? await supabase.from('tenants').select('timezone, copilot_enabled').eq('id', userRow.tenant_id).single()
    : { data: null }
  const timezone = tenantRow?.timezone ?? 'UTC'
  const copilotEnabled = tenantRow?.copilot_enabled ?? false

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Profile</h2>
          <p>Operator identity, timezone, and session security.</p>
        </div>
      </div>

      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd">
          <div><h3>Identity</h3></div>
        </header>
        <div className="pt-card-body pt-st-card-body">
          <div className="pt-st-profile-id">
            <div className="pt-st-av-lg">{initials(displayName)}</div>
            <div className="pt-st-profile-id-fields">
              <div className="pt-st-field is-compact">
                <div className="pt-st-field-l"><label>Display name</label></div>
                <div className="pt-st-field-r">
                  <input className="pt-st-input" defaultValue={displayName} disabled />
                </div>
              </div>
              <div className="pt-st-field is-compact">
                <div className="pt-st-field-l"><label>Email</label></div>
                <div className="pt-st-field-r">
                  <input className="pt-st-input" defaultValue={user?.email ?? ''} disabled />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd">
          <div>
            <h3>Time & locale</h3>
            <p>Drives daily digest timing and message timestamps.</p>
          </div>
        </header>
        <div className="pt-card-body pt-st-card-body">
          <div className="pt-st-field">
            <div className="pt-st-field-l"><label>Timezone</label></div>
            <div className="pt-st-field-r">
              <select className="pt-st-input" defaultValue={timezone} disabled>
                {[
                  'Pacific/Honolulu','America/Anchorage','America/Los_Angeles','America/Denver',
                  'America/Chicago','America/New_York','America/Sao_Paulo','Europe/London',
                  'Europe/Amsterdam','Europe/Lisbon','Europe/Istanbul','Asia/Dubai',
                  'Asia/Karachi','Asia/Kolkata','Asia/Bangkok','Asia/Singapore',
                  'Asia/Shanghai','Asia/Tokyo','Australia/Sydney','Pacific/Auckland','UTC',
                ].map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd">
          <div>
            <h3>AI features</h3>
            <p>Pipeline-level AI assistance for your inbox.</p>
          </div>
        </header>
        <div className="pt-card-body pt-st-card-body">
          <CopilotToggle enabled={copilotEnabled} />
        </div>
      </section>

      <div className="pt-st-foot">
        <span className="pt-st-foot-status"><i />Profile settings — editing coming soon</span>
      </div>
    </div>
  )
}
