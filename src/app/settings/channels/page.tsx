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

// Shared step-instruction styling for the Telegram setup walk-through.
// Inline because this is a single-use panel — promote to a CSS rule if we add
// the same pattern for WhatsApp / email setup later.
const stepBadgeStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
  background: 'var(--pt-accent-soft, rgba(120,160,100,0.14))',
  color: 'var(--pt-accent, #6aa56a)',
  fontSize: 11, fontWeight: 600, lineHeight: 1, marginTop: 1,
} as const

const stepTitleStyle = {
  color: 'var(--pt-fg)', fontSize: 12.5, fontWeight: 600, marginBottom: 3,
} as const

const stepBodyStyle = {
  color: 'var(--pt-fg-3)', fontSize: 12, lineHeight: 1.55,
} as const

const inlineCodeStyle = {
  fontFamily: 'var(--pt-mono, ui-monospace, monospace)',
  fontSize: 11.5, padding: '1px 5px', borderRadius: 3,
  background: 'var(--pt-surface-2, rgba(0,0,0,0.04))',
  color: 'var(--pt-fg-2, inherit)',
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

  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('intended_channels')
    .eq('id', userRow?.tenant_id ?? '')
    .single()

  const connected = Object.fromEntries((tenantChannels ?? []).map((c) => [c.channel_type, c]))

  const intendedChannels: string[] = (tenantRow?.intended_channels ?? []) as string[]
  const connectedTypes = new Set((tenantChannels ?? []).map((c: { channel_type: string }) => c.channel_type))
  const pendingIntended = intendedChannels.filter(c => !connectedTypes.has(c))

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Channels</h2>
          <p>Inbound message channels — connect, configure, or rotate.</p>
        </div>
      </div>

      {pendingIntended.length > 0 && (
        <div className="ob-setup-nudge">
          <div className="ob-setup-nudge-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
              <line x1="8" y1="5" x2="8" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="11" r="0.8" fill="currentColor"/>
            </svg>
          </div>
          <div className="ob-setup-nudge-body">
            <div className="ob-setup-nudge-title">Finish your setup</div>
            <p className="ob-setup-nudge-sub">
              You selected {pendingIntended.map(c => CHANNEL_META[c]?.label ?? c).join(' and ')} during onboarding — connect {pendingIntended.length === 1 ? 'it' : 'them'} below to start receiving messages.
            </p>
          </div>
        </div>
      )}

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
                  <form action={disconnectChannel.bind(null, 'whatsapp') as never}>
                    <button type="submit" className="pt-st-mini pt-st-mini-warn">Disconnect</button>
                  </form>
                ) : (
                  <details style={{ width: '100%' }}>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Connect</summary>
                    <form action={connectWhatsAppNumber as never} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
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
                  <form action={disconnectChannel.bind(null, 'telegram') as never}>
                    <button type="submit" className="pt-st-mini pt-st-mini-warn">Disconnect</button>
                  </form>
                ) : (
                  <details style={{ width: '100%' }}>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Connect</summary>

                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <p style={{ fontSize: 12, color: 'var(--pt-fg-3)', margin: 0, lineHeight: 1.55 }}>
                        Peptech connects to Telegram via a silent bot linked to your Telegram Business account. Three steps:
                      </p>

                      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

                        <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={stepBadgeStyle}>1</span>
                          <div style={{ flex: 1, paddingTop: 1 }}>
                            <div style={stepTitleStyle}>Create a bot via BotFather</div>
                            <div style={stepBodyStyle}>
                              In Telegram, open a chat with <code style={inlineCodeStyle}>@BotFather</code>, send <code style={inlineCodeStyle}>/newbot</code>, give it a name and a username ending in <code style={inlineCodeStyle}>_bot</code>. BotFather will reply with a <strong>bot token</strong> — copy it.
                            </div>
                          </div>
                        </li>

                        <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={stepBadgeStyle}>2</span>
                          <div style={{ flex: 1, paddingTop: 1 }}>
                            <div style={stepTitleStyle}>Paste the token below and save</div>
                            <div style={stepBodyStyle}>
                              Peptech registers the webhook with Telegram automatically — no URL to copy anywhere. The token stays server-side; we never expose it to the browser.
                            </div>
                          </div>
                        </li>

                        <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={stepBadgeStyle}>3</span>
                          <div style={{ flex: 1, paddingTop: 1 }}>
                            <div style={stepTitleStyle}>Link the bot to your Telegram Business account</div>
                            <div style={stepBodyStyle}>
                              In the Telegram app: <strong>Settings → Telegram Business → Chatbots</strong>, search for your bot, tap <strong>Connect</strong>, and grant the message-read / reply permission. From then on, every message a customer sends to your personal account flows silently through the bot into your Peptech inbox.
                            </div>
                          </div>
                        </li>

                      </ol>

                      <form action={saveTelegramCredentials as never} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          name="botToken"
                          placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                          required
                          style={{ ...inputStyle, fontFamily: 'var(--pt-mono, ui-monospace, monospace)', fontSize: 12 }}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>
                          Save token &amp; register webhook
                        </button>
                      </form>

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--pt-accent-soft, rgba(120,160,100,0.10))', fontSize: 11.5, color: 'var(--pt-fg-3)', lineHeight: 1.5 }}>
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1, color: 'var(--pt-accent, #6aa56a)' }}>
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
                            <polyline points="5,8 7.3,10.3 11,6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>
                            The first inbound customer message confirms the connection — there&apos;s no test button. Telegram Business is a paid feature on your end, but the Peptech bot itself is free.
                          </span>
                      </div>
                    </div>
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
                  <form action={disconnectChannel.bind(null, 'email') as never}>
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
