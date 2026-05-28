// slack-notify — central Slack dispatcher for ops alerts across both projects
// (pepbase marketing + Pep Tech app). DB triggers POST a row-change payload here;
// this function formats it and posts to a Slack incoming webhook.
//
// Deployed with --no-verify-jwt because the caller is a Postgres trigger, not a
// logged-in user. Access is gated by a shared secret in the x-webhook-secret
// header (stored in Supabase Vault on the DB side, in WEBHOOK_SECRET here).
//
// To add a new alert: add a case to formatMessage() keyed on table name.

interface WebhookPayload {
  table?: string;
  type?: 'INSERT' | 'UPDATE' | 'DELETE';
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
}

const VOLUME_LABEL: Record<string, string> = {
  '<10k': '< $10k/mo',
  '10-50k': '$10k–$50k/mo',
  '50-250k': '$50k–$250k/mo',
  '250k+': '$250k+/mo',
};

function formatMessage(p: WebhookPayload): { text: string } | null {
  const r = p.record ?? {};
  if (p.table === 'waitlist_signups' && p.type === 'INSERT') {
    const channel = r.channel === 'phone' ? 'WhatsApp' : 'Email';
    const volume = VOLUME_LABEL[String(r.volume_bucket)] ?? String(r.volume_bucket ?? '?');
    return {
      text: [
        ':tada: *New waitlist signup*',
        `• ${channel}: \`${r.contact ?? '?'}\``,
        `• Volume: ${volume}`,
        `• Source: ${r.source ?? 'landing'}`,
      ].join('\n'),
    };
  }
  // New Pep Tech tenant. Fired by a trigger on the owner users row (see
  // tenant_slack_trigger migration), which enriches the payload with the
  // business name and owner email.
  if (p.table === 'tenants' && p.type === 'INSERT') {
    return {
      text: [
        ':tada: *New merchant signed up*',
        `• Business: *${r.business_name ?? '?'}*`,
        `• Email: \`${r.email ?? '?'}\``,
        `• Tenant ID: \`${r.tenant_id ?? '?'}\``,
      ].join('\n'),
    };
  }
  // Unknown event — skip rather than spam the channel.
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const expected = Deno.env.get('WEBHOOK_SECRET');
  if (expected && req.headers.get('x-webhook-secret') !== expected) {
    return new Response('forbidden', { status: 403 });
  }

  const webhook = Deno.env.get('SLACK_WEBHOOK_URL');
  if (!webhook) {
    return new Response('SLACK_WEBHOOK_URL not configured', { status: 500 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const message = formatMessage(payload);
  if (!message) {
    // Nothing to send for this event; acknowledge so the trigger doesn't retry.
    return new Response('ignored', { status: 200 });
  }

  const slackRes = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!slackRes.ok) {
    const detail = await slackRes.text();
    console.error('slack post failed', slackRes.status, detail);
    return new Response('slack error', { status: 502 });
  }

  return new Response('ok', { status: 200 });
});
