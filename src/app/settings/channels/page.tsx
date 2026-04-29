import { createClient } from '@/lib/supabase/server'
import { saveTelegramCredentials, connectWhatsAppNumber, disconnectChannel } from './actions'

const CHANNEL_META: Record<string, { label: string; color: string; initial: string }> = {
  whatsapp: { label: 'WhatsApp', color: 'oklch(0.62 0.13 150)', initial: 'W' },
  telegram: { label: 'Telegram', color: 'oklch(0.66 0.13 240)', initial: 'T' },
  email:    { label: 'Email',    color: 'oklch(0.55 0.02 280)', initial: 'E' },
}

const inputStyle = {
  height: 32, padding: '0 10px', borderRadius: 'var(--pt-radius-sm)',
  border: '0.5px solid var(--pt-line)', background: 'var(--pt-bg)',
  font: 'inherit', fontSize: 12.5, color: 'var(--pt-fg)', outline: 'none', width: '100%',
} as const

export default async function ChannelsPage() {
  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: tenantChannels } = await supabase
    .from('tenant_channels')
    .select('channel_type, is_active, identifier')

  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .single()

  const connected = Object.fromEntries((tenantChannels ?? []).map((c) => [c.channel_type, c]))

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Channels</h2>
          <p>Inbound message channels — connect, configure, or rotate.</p>
        </div>
      </div>

      {/* Connected channels */}
      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd">
          <div>
            <h3>Connected channels</h3>
            <p>Manage your active messaging integrations.</p>
          </div>
        </header>
        <div className="pt-card-body pt-st-card-body">
          <ul className="pt-st-chans">

            {/* WhatsApp */}
            <li className={`pt-st-chan pt-st-chan-${connected.whatsapp?.is_active ? 'connected' : 'disconnected'}`}>
              <div className="pt-st-chan-l">
                <div className="pt-st-chan-icon" style={{ background: CHANNEL_META.whatsapp.color }}>W</div>
                <div>
                  <div className="pt-st-chan-name">
                    WhatsApp
                    <span className={`pt-st-chan-pill pt-st-chan-pill-${connected.whatsapp?.is_active ? 'connected' : 'disconnected'}`}>
                      <i />{connected.whatsapp?.is_active ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  {connected.whatsapp?.is_active ? (
                    <>
                      <div className="pt-st-chan-handle mono">{connected.whatsapp.identifier}</div>
                      <div className="pt-st-chan-meta">
                        Webhook: <span className="mono" style={{ fontSize: 10 }}>{appUrl}/api/webhooks/whatsapp/{userRow?.tenant_id}</span>
                      </div>
                    </>
                  ) : (
                    <div className="pt-st-chan-handle">Not connected</div>
                  )}
                </div>
              </div>
              <div className="pt-st-chan-r">
                {connected.whatsapp?.is_active ? (
                  <form action={disconnectChannel.bind(null, 'whatsapp')}>
                    <button type="submit" className="pt-st-mini pt-st-mini-warn">Disconnect</button>
                  </form>
                ) : (
                  <details style={{ width: '100%' }}>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Connect</summary>
                    <form action={connectWhatsAppNumber} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <input name="phoneNumber" placeholder="+15550001234" required style={inputStyle} />
                      <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', margin: 0 }}>
                        E.164 format: +[country code][number], e.g. +15550001234. Spaces and dashes are stripped automatically.
                      </p>
                      <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Connect</button>
                    </form>
                  </details>
                )}
              </div>
            </li>

            {/* Telegram */}
            <li className={`pt-st-chan pt-st-chan-${connected.telegram?.is_active ? 'connected' : 'disconnected'}`}>
              <div className="pt-st-chan-l">
                <div className="pt-st-chan-icon" style={{ background: CHANNEL_META.telegram.color }}>T</div>
                <div>
                  <div className="pt-st-chan-name">
                    Telegram
                    <span className={`pt-st-chan-pill pt-st-chan-pill-${connected.telegram?.is_active ? 'connected' : 'disconnected'}`}>
                      <i />{connected.telegram?.is_active ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  {connected.telegram?.is_active ? (
                    <div className="pt-st-chan-handle mono">{connected.telegram.identifier}</div>
                  ) : (
                    <div className="pt-st-chan-handle">Not connected</div>
                  )}
                </div>
              </div>
              <div className="pt-st-chan-r">
                {connected.telegram?.is_active ? (
                  <form action={disconnectChannel.bind(null, 'telegram')}>
                    <button type="submit" className="pt-st-mini pt-st-mini-warn">Disconnect</button>
                  </form>
                ) : (
                  <details style={{ width: '100%' }}>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Connect</summary>
                    <form action={saveTelegramCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <input name="botToken" placeholder="Bot token from @BotFather" required style={inputStyle} />
                      <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Save</button>
                    </form>
                  </details>
                )}
              </div>
            </li>

            {/* Email */}
            <li className={`pt-st-chan pt-st-chan-${connected.email?.is_active ? 'connected' : 'disconnected'}`}>
              <div className="pt-st-chan-l">
                <div className="pt-st-chan-icon" style={{ background: CHANNEL_META.email.color }}>E</div>
                <div>
                  <div className="pt-st-chan-name">
                    Email
                    <span className={`pt-st-chan-pill pt-st-chan-pill-${connected.email?.is_active ? 'connected' : 'disconnected'}`}>
                      <i />{connected.email?.is_active ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  {connected.email?.is_active ? (
                    <div className="pt-st-chan-handle mono">{connected.email.identifier}</div>
                  ) : (
                    <div className="pt-st-chan-handle">Connect via Gmail or Outlook OAuth</div>
                  )}
                </div>
              </div>
              <div className="pt-st-chan-r">
                {connected.email?.is_active ? (
                  <form action={disconnectChannel.bind(null, 'email')}>
                    <button type="submit" className="pt-st-mini pt-st-mini-warn">Disconnect</button>
                  </form>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href="/api/settings/channels/oauth/google" className="pt-btn pt-btn-ghost" style={{ fontSize: 12 }}>Connect Gmail</a>
                    <a href="/api/settings/channels/oauth/microsoft" className="pt-btn pt-btn-ghost" style={{ fontSize: 12 }}>Connect Outlook</a>
                  </div>
                )}
              </div>
            </li>

          </ul>
        </div>
      </section>

      <div className="pt-st-foot">
        <span className="pt-st-foot-status"><i />Changes saved automatically</span>
      </div>
    </div>
  )
}
