'use client'

import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowMenu } from './RowMenu'

type Channel = { channel_type: string; display_handle: string; is_primary: boolean }

type Lead = {
  id: string
  display_name: string
  acquisition_source: 'referral' | 'community' | 'group_chat' | 'direct' | 'other' | null
  created_at: string
  customer_channels: Channel[]
}

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = {
  whatsapp: Icons.wa,
  telegram: Icons.tg,
  email:    Icons.em,
}

const CH_KEY: Record<string, string> = { whatsapp: 'wa', telegram: 'tg', email: 'em' }

const SOURCE_LABEL: Record<string, string> = {
  referral:    'Referral',
  community:   'Community',
  group_chat:  'Group chat',
  direct:      'Direct',
  other:       'Other',
}

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0]]).join('')
}

function fmtAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface Props {
  leads: Lead[]
  recentConvByCustomer: Record<string, { channelType: string; lastMessageAt: string | null }>
  leavingIds?: Set<string>
  onRowConverted?: (customerId: string, newStage: 'lead' | 'customer') => void
}

export function LeadsTable({ leads, recentConvByCustomer, leavingIds, onRowConverted }: Props) {
  if (leads.length === 0) {
    return (
      <div className="pt-grid" style={{ gridTemplateColumns: '1fr' }}>
        <section className="pt-card">
          <div className="pt-card-body" style={{ padding: 0 }}>
            <div className="pt-empty-page" style={{ minHeight: 280 }}>
              <EmptyState
                icon={<Icons.users size={24} />}
                title="No leads yet"
                body="New conversations from unknown handles will appear here."
              />
            </div>
          </div>
        </section>
      </div>
    )
  }
  return (
    <div className="pt-grid" style={{ gridTemplateColumns: '1fr' }}>
      <section className="pt-card">
        <div className="pt-card-body" style={{ padding: 0 }}>
          <table className="pt-cl">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 48, textAlign: 'center' }}>Ch</th>
                <th>Source</th>
                <th>Added</th>
                <th>Last message</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {leads.map(l => {
                const recentConv = recentConvByCustomer[l.id]
                const fallback   = l.customer_channels.find(c => c.is_primary) ?? l.customer_channels[0]
                const channelType = recentConv?.channelType ?? fallback?.channel_type ?? null
                const chKey = channelType ? (CH_KEY[channelType] ?? null) : null
                const Icon = channelType ? CH_ICONS[channelType] : null
                const lastMsg = recentConv?.lastMessageAt ?? null
                const isLeaving = leavingIds?.has(l.id) ?? false
                return (
                  <tr key={l.id} className={isLeaving ? 'pt-row-leaving' : undefined}>
                    <td>
                      <div className="pt-cl-cust">
                        <div className="pt-thread-av" data-channel={chKey ?? 'wa'}>
                          <span>{initials(l.display_name)}</span>
                          {Icon && chKey && (
                            <i className={`pt-thread-ch pt-ch-${chKey}`}><Icon size={9} /></i>
                          )}
                        </div>
                        <div className="pt-cl-name">
                          <Link href={`/customers/${l.id}`} className="pt-link">
                            {l.display_name}
                          </Link>
                          {isLeaving && (
                            <span className="pt-row-success">
                              <Icons.check size={12} /> Marked as customer
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {Icon && chKey ? (
                        <span className={`pt-cl-ch-icon pt-ch-${chKey}`}><Icon size={14} /></span>
                      ) : (
                        <span className="pt-cl-no-supply">—</span>
                      )}
                    </td>
                    <td>{l.acquisition_source ? SOURCE_LABEL[l.acquisition_source] : <span className="pt-cl-no-supply">—</span>}</td>
                    <td className="pt-cl-last-order">{fmtAge(l.created_at)}</td>
                    <td className="pt-cl-last-order">{lastMsg ? fmtAge(lastMsg) : <span className="pt-cl-no-supply">—</span>}</td>
                    <td>
                      <RowMenu
                        customerId={l.id}
                        currentStage="lead"
                        onSuccess={(stage) => onRowConverted?.(l.id, stage)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
