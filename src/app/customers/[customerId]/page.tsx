import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { initials } from '@/types/inbox'

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>
}) {
  const { customerId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: customer } = await supabase
    .from('customers')
    .select('id, display_name, trust_score, ltv, customer_channels(channel_type, display_handle, is_primary), customer_tags(tag)')
    .eq('id', customerId)
    .single()

  if (!customer) redirect('/inbox')

  const { data: customerNotes } = await supabase
    .from('notes')
    .select('id, content, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(5)

  const primaryChannel = customer.customer_channels?.find((c) => c.is_primary) ?? customer.customer_channels?.[0]
  const trustCls = customer.trust_score >= 85 ? 'hi' : customer.trust_score >= 65 ? 'md' : 'lo'

  const channelLabel = (ct: string) =>
    ct === 'whatsapp' ? 'WhatsApp' : ct === 'telegram' ? 'Telegram' : 'Email'

  return (
    <Shell section="Customers">
      <div className="pt-cu">
        {/* Header */}
        <div className="pt-cu-hd">
          <Link href="/inbox" className="pt-ix-back" title="Back to inbox">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6"/>
            </svg>
          </Link>
          <div className="pt-cu-hd-id">
            <div className="pt-cu-hd-av" data-channel={primaryChannel?.channel_type}>
              {initials(customer.display_name)}
            </div>
            <div>
              <div className="pt-cu-hd-name">
                {customer.display_name}
                {customer.customer_tags?.some((t) => t.tag === 'vip') && (
                  <span className="pt-tag pt-tag-vip">VIP</span>
                )}
              </div>
              <div className="pt-cu-hd-handle mono">
                {primaryChannel?.display_handle ?? '—'}
                {primaryChannel && ` · ${channelLabel(primaryChannel.channel_type)}`}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-cu-body">
          {/* Stats strip */}
          <div className="pt-cu-strip">
            <div className={`pt-cu-stat pt-cu-trust pt-trust-${trustCls}`}>
              <div className="lbl">Trust</div>
              <div className="val">{customer.trust_score}</div>
            </div>
            <div className="pt-cu-stat">
              <div className="lbl">LTV</div>
              <div className="val mono">${customer.ltv.toLocaleString()}</div>
            </div>
            {customer.customer_channels?.map((ch) => (
              <div key={ch.channel_type} className="pt-cu-stat">
                <div className="lbl">{channelLabel(ch.channel_type)}</div>
                <div className="val" style={{ fontSize: 13 }}>{ch.display_handle}</div>
              </div>
            ))}
          </div>

          <div className="pt-cu-grid">
            <div className="pt-cu-col">

              {/* Tags */}
              <div className="pt-card">
                <div className="pt-card-hd"><h3>Tags</h3></div>
                <div className="pt-card-body" style={{ padding: '4px 14px 12px' }}>
                  <div className="pt-cu-tags">
                    {customer.customer_tags?.length ? (
                      customer.customer_tags.map((t) => (
                        <span key={t.tag} className="pt-tag">{t.tag}</span>
                      ))
                    ) : (
                      <span style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>No tags</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="pt-card">
                <div className="pt-card-hd"><h3>Notes</h3></div>
                <ul className="pt-cu-notes">
                  {customerNotes && customerNotes.length > 0 ? (
                    customerNotes.map((n) => (
                      <li key={n.id}>
                        <div className="pt-cu-note-at mono">
                          {new Date(n.created_at).toLocaleDateString()}
                        </div>
                        <div className="pt-cu-note-text">{n.content}</div>
                      </li>
                    ))
                  ) : (
                    <li style={{ padding: '12px 14px', color: 'var(--pt-fg-4)', fontSize: 12 }}>
                      No notes yet
                    </li>
                  )}
                </ul>
              </div>

            </div>

            <div className="pt-cu-col">

              {/* Channels */}
              <div className="pt-card">
                <div className="pt-card-hd"><h3>Channels</h3></div>
                <div className="pt-card-body" style={{ padding: '4px 14px 12px' }}>
                  {customer.customer_channels?.map((ch) => (
                    <div key={ch.channel_type} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12 }}>
                      <span style={{ color: 'var(--pt-fg-4)', width: 80 }}>{channelLabel(ch.channel_type)}</span>
                      <span className="mono">{ch.display_handle}</span>
                      {ch.is_primary && <span className="pt-tag pt-tag-soft">primary</span>}
                    </div>
                  ))}
                  {!customer.customer_channels?.length && (
                    <span style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>No channels</span>
                  )}
                </div>
              </div>

              {/* Order history — stubbed until orders are built */}
              <div className="pt-card">
                <div className="pt-card-hd">
                  <h3>Orders</h3>
                  <p>Coming in Phase 3</p>
                </div>
                <div className="pt-card-body" style={{ padding: '8px 14px 14px' }}>
                  <div style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>
                    LTV ${customer.ltv.toLocaleString()} · order history available after Phase 3
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
