import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const SCOPES = [
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.Send',
]

function getMsAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/settings/channels/oauth/microsoft`,
    scope: SCOPES.join(' '),
    response_mode: 'query',
    state: 'peptech-email',
  })
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`
}

// GET /api/settings/channels/oauth/microsoft
// Without ?code: redirect to Microsoft OAuth
// With ?code: exchange code for tokens, save credentials
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) return NextResponse.redirect(new URL('/settings/channels?error=ms_denied', request.url))

  if (!code) {
    return NextResponse.redirect(getMsAuthUrl())
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? 'common'}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/settings/channels/oauth/microsoft`,
        scope: SCOPES.join(' '),
      }),
    }
  )

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/settings/channels?error=ms_token_failed', request.url))
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  const meRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const me = await meRes.json() as { mail?: string; userPrincipalName?: string }
  const emailAddress = me.mail ?? me.userPrincipalName ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.redirect(new URL('/login', request.url))

  await supabase.from('tenant_channels').upsert({
    tenant_id: userRow.tenant_id,
    channel_type: 'email',
    identifier: emailAddress,
    credentials: {
      provider: 'microsoft',
      email_address: emailAddress,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    },
    is_active: true,
  }, { onConflict: 'tenant_id,channel_type' })

  revalidatePath('/settings/channels')
  return NextResponse.redirect(new URL('/settings/channels?connected=outlook', request.url))
}
