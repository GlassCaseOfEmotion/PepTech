import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { saveTelegramCredentials, saveWhatsAppCredentials, disconnectChannel } from './actions'

export default async function ChannelsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) redirect('/login')

  const { data: channels } = await supabase
    .from('tenant_channels')
    .select('channel_type, is_active, identifier')
    .eq('tenant_id', userRow.tenant_id)

  const connectedMap = Object.fromEntries((channels ?? []).map((c) => [c.channel_type, c]))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'

  const inputStyle = {
    height: 34, padding: '0 10px', borderRadius: 'var(--pt-radius-sm)',
    border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
    font: 'inherit', fontSize: 12.5, color: 'var(--pt-fg)', outline: 'none', width: '100%',
  } as const

  return (
    <div className="pt-page">
      <div className="pt-page-hd">
        <div>
          <h1>Channels</h1>
          <p>Connect your messaging channels to start receiving and sending messages.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>

        {/* WhatsApp */}
        <div className="pt-card">
          <div className="pt-card-hd">
            <div>
              <h3>WhatsApp</h3>
              <p>Connect via 360dialog. Your webhook URL:
                <code style={{ fontSize: 11, marginLeft: 6, color: 'var(--pt-accent-fg)' }}>
                  {appUrl}/api/webhooks/whatsapp/{userRow.tenant_id}
                </code>
              </p>
            </div>
            {connectedMap.whatsapp?.is_active && (
              <span className="pt-tag pt-tag-vip">Connected</span>
            )}
          </div>
          <div className="pt-card-body" style={{ padding: '8px 14px 14px' }}>
            {connectedMap.whatsapp?.is_active ? (
              <form action={disconnectChannel.bind(null, 'whatsapp')}>
                <button type="submit" className="pt-btn">Disconnect</button>
              </form>
            ) : (
              <form action={saveWhatsAppCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input name="apiKey" placeholder="360dialog API key" required style={inputStyle} />
                <input name="phoneNumberId" placeholder="Phone number ID" required style={inputStyle} />
                <input name="webhookSecret" placeholder="Webhook secret (optional)" style={inputStyle} />
                <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start' }}>Connect WhatsApp</button>
              </form>
            )}
          </div>
        </div>

        {/* Telegram */}
        <div className="pt-card">
          <div className="pt-card-hd">
            <div>
              <h3>Telegram</h3>
              <p>Create a bot via @BotFather and paste the token below. We&apos;ll register the webhook automatically.</p>
            </div>
            {connectedMap.telegram?.is_active && (
              <span className="pt-tag pt-tag-vip">Connected</span>
            )}
          </div>
          <div className="pt-card-body" style={{ padding: '8px 14px 14px' }}>
            {connectedMap.telegram?.is_active ? (
              <form action={disconnectChannel.bind(null, 'telegram')}>
                <button type="submit" className="pt-btn">Disconnect</button>
              </form>
            ) : (
              <form action={saveTelegramCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input name="botToken" placeholder="Bot token from @BotFather" required style={inputStyle} />
                <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start' }}>Connect Telegram</button>
              </form>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="pt-card">
          <div className="pt-card-hd">
            <div>
              <h3>Email</h3>
              <p>Connect your Gmail or Outlook account via OAuth.</p>
            </div>
            {connectedMap.email?.is_active && (
              <span className="pt-tag pt-tag-vip">Connected · {connectedMap.email.identifier}</span>
            )}
          </div>
          <div className="pt-card-body" style={{ padding: '8px 14px 14px', display: 'flex', gap: 8 }}>
            {connectedMap.email?.is_active ? (
              <form action={disconnectChannel.bind(null, 'email')}>
                <button type="submit" className="pt-btn">Disconnect</button>
              </form>
            ) : (
              <>
                <a href="/api/settings/channels/oauth/google" className="pt-btn">Connect Gmail</a>
                <a href="/api/settings/channels/oauth/microsoft" className="pt-btn">Connect Outlook</a>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
