type SlackBlock =
  | { type: 'header'; text: { type: 'plain_text'; text: string } }
  | { type: 'section'; fields: { type: 'mrkdwn'; text: string }[] }
  | { type: 'divider' }

async function postSlack(blocks: SlackBlock[], fallbackText: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return  // silently skip if not configured

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fallbackText, blocks }),
    })
    if (!res.ok) console.error(`Slack webhook failed: ${res.status} ${await res.text()}`)
  } catch (err) {
    console.error('Slack notification error:', err)
  }
}

export async function notifyNewMerchant(opts: {
  tenantId: string
  businessName: string
  email: string
}): Promise<void> {
  const time = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })

  await postSlack(
    [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🎉 New merchant signed up' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Business*\n${opts.businessName}` },
          { type: 'mrkdwn', text: `*Email*\n${opts.email}` },
          { type: 'mrkdwn', text: `*Tenant ID*\n\`${opts.tenantId}\`` },
          { type: 'mrkdwn', text: `*Time*\n${time}` },
        ],
      },
    ],
    `🎉 New merchant: ${opts.businessName} (${opts.email})`,
  )
}
