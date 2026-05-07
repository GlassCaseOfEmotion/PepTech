import Link from 'next/link'
import { initials } from '@/types/inbox'
import type { ConversationWithCustomer } from '@/types/inbox'

interface CustomerRailProps {
  conversation: ConversationWithCustomer
}

export function CustomerRail({ conversation }: CustomerRailProps) {
  const customer = conversation.customers
  if (!customer) return null

  const name = customer.display_name
  const trustCls = customer.trust_score >= 85 ? 'hi' : customer.trust_score >= 65 ? 'md' : 'lo'

  const channelLabel = conversation.channel_type === 'whatsapp' ? 'WhatsApp'
    : conversation.channel_type === 'telegram' ? 'Telegram'
    : 'Email'

  return (
    <aside className="pt-ix-rail">
      {/* Customer card */}
      <div className="pt-cust">
        <div className="pt-cust-hd">
          <div className="pt-cust-av" data-channel={conversation.channel_type}>
            {initials(name)}
          </div>
          <div className="pt-cust-id">
            <div className="pt-cust-name">{name}</div>
            <div className="pt-cust-handle mono">{conversation.channel_identifier}</div>
          </div>
          <div className={`pt-trust pt-trust-${trustCls}`}>
            <div className="pt-trust-num">{customer.trust_score}</div>
            <div className="pt-trust-lbl">trust</div>
          </div>
        </div>

        <div className="pt-cust-stats">
          <div>
            <div className="lbl">LTV</div>
            <div className="val mono">${customer.ltv.toLocaleString()}</div>
          </div>
          <div>
            <div className="lbl">Channel</div>
            <div className="val">{channelLabel}</div>
          </div>
        </div>

        <div className="pt-cust-tags">
          {customer.customer_tags.map((t) => (
            <span key={t.tag} className="pt-tag pt-tag-soft">{t.tag}</span>
          ))}
        </div>
      </div>

      {/* Open profile link */}
      <div className="pt-right-section">
        <div className="pt-right-hd">
          <span>Customer</span>
          <Link href={`/customers/${customer.id}`} className="pt-link">Open →</Link>
        </div>
      </div>
    </aside>
  )
}
