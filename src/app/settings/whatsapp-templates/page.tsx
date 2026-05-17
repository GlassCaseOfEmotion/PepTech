import { createClient } from '@/lib/supabase/server'
import { WaTemplatesForm } from './WaTemplatesForm'

export default async function WhatsAppTemplatesPage() {
  const supabase = await createClient()
  const { data: templates } = await supabase
    .from('whatsapp_templates')
    .select('id, name, body, variables, content_sid, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>WhatsApp templates</h2>
          <p>HSM templates for sending messages outside the 24-hour conversation window.</p>
        </div>
      </div>

      <section className="pt-card pt-st-card" style={{ borderLeft: '3px solid #d97706' }}>
        <div className="pt-card-body" style={{ padding: '12px 16px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--pt-fg-2)', margin: 0, lineHeight: 1.6 }}>
            <strong>How it works:</strong> Create your template body here, then add it in your{' '}
            <strong>Twilio Console</strong> and submit to Meta for approval. Once approved,
            paste the <strong>Twilio Content SID</strong> (starts with <code style={{ fontFamily: 'monospace', background: 'var(--pt-line)', padding: '1px 4px', borderRadius: 3 }}>HX</code>)
            {' '}back here and set the status to <strong>Approved</strong>.
          </p>
        </div>
      </section>

      <WaTemplatesForm templates={templates ?? []} />
    </div>
  )
}
