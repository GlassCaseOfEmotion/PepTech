import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/settings/channels/oauth/google`,
  )
}

// GET /api/settings/channels/oauth/google
// Without ?code: redirect to Google OAuth consent screen
// With ?code: exchange code for tokens, save to tenant_channels
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) return NextResponse.redirect(new URL('/settings/channels?error=google_denied', request.url))

  const oauth2 = getOAuth2Client()

  if (!code) {
    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'email',
      ],
      prompt: 'consent',
    })
    return NextResponse.redirect(authUrl)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.redirect(new URL('/login', request.url))

  const { tokens } = await oauth2.getToken(code)
  oauth2.setCredentials(tokens)

  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL('/settings/channels?error=google_no_refresh_token', request.url))
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2 })
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const emailAddress = profile.data.emailAddress ?? ''

  await supabase.from('tenant_channels').upsert({
    tenant_id: userRow.tenant_id,
    channel_type: 'email',
    identifier: emailAddress,
    credentials: {
      provider: 'google',
      email_address: emailAddress,
      refresh_token: tokens.refresh_token ?? '',
      access_token: tokens.access_token ?? '',
      expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : new Date(Date.now() + 3600000).toISOString(),
    },
    is_active: true,
  }, { onConflict: 'tenant_id,channel_type' })

  // Register Gmail push notifications if Pub/Sub topic is configured
  if (process.env.GOOGLE_PUBSUB_TOPIC) {
    try {
      await gmail.users.watch({
        userId: 'me',
        requestBody: { topicName: process.env.GOOGLE_PUBSUB_TOPIC, labelIds: ['INBOX'] },
      })
    } catch {
      // Non-fatal — can be retried via settings
    }
  }

  revalidatePath('/settings/channels')
  return NextResponse.redirect(new URL('/settings/channels?connected=gmail', request.url))
}
