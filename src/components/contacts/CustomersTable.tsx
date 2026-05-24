'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatAmount } from '@/lib/currency'
import type { SupplyStatus } from '@/types/protocols'

type CustomerChannel = { channel_type: string; display_handle: string; is_primary: boolean }
type CustomerTag = { tag: string }

type Customer = {
  id: string
  display_name: string
  trust_score: number
  ltv: number
  customer_channels: CustomerChannel[]
  customer_tags: CustomerTag[]
}

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { whatsapp: Icons.wa, telegram: Icons.tg, email: Icons.em }
const CH_KEY: Record<string, string> = { whatsapp: 'wa', telegram: 'tg', email: 'em' }

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0]]).join('')
}

function fmtLastOrder(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

interface Props {
  customers: Customer[]
  supplyStatuses?: Record<string, SupplyStatus | null>
  orderStats?: Record<string, { count: number; lastOrderAt: string | null }>
  baseCurrency: string
  hasChannels?: boolean
  onClearFilters?: () => void
  totalCount?: number
}

export function CustomersTable({
  customers,
  supplyStatuses = {},
  orderStats = {},
  baseCurrency,
  hasChannels = false,
  onClearFilters,
  totalCount,
}: Props) {
  const router = useRouter()

  return (
    <div className="pt-grid" style={{ gridTemplateColumns: '1fr' }}>
      <section className="pt-card">
        <div className="pt-card-body" style={{ padding: 0 }}>
          <table className="pt-cl">
            <thead>
              <tr>
                <th>Customer</th>
                <th style={{ width: 48, textAlign: 'center' }}>Ch</th>
                <th>Contact</th>
                <th className="r">LTV</th>
                <th className="r">Orders</th>
                <th>Last order</th>
                <th>Trust</th>
                <th>Supply</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (totalCount ?? 0) === 0 && !hasChannels && (
                <tr>
                  <td colSpan={99} style={{ padding: 0 }}>
                    <div className="pt-empty-page" style={{ minHeight: 360 }}>
                      <EmptyState
                        size="lg"
                        icon={
                          <svg width="130" height="100" viewBox="0 0 130 100" fill="none" stroke="currentColor" strokeLinecap="round">
                            <circle cx="65" cy="50" r="11" strokeWidth="1.2"/>
                            <circle cx="25" cy="22" r="8" strokeWidth="1" opacity="0.45"/>
                            <circle cx="105" cy="25" r="8" strokeWidth="1" opacity="0.45"/>
                            <circle cx="112" cy="70" r="7" strokeWidth="0.9" opacity="0.35"/>
                            <circle cx="22" cy="72" r="7" strokeWidth="0.9" opacity="0.35"/>
                            <circle cx="65" cy="90" r="6" strokeWidth="0.9" opacity="0.3"/>
                            <circle cx="10" cy="47" r="5" strokeWidth="0.8" opacity="0.22"/>
                            <circle cx="120" cy="47" r="5" strokeWidth="0.8" opacity="0.22"/>
                            <line x1="65" y1="50" x2="25" y2="22" strokeWidth="0.8" opacity="0.2"/>
                            <line x1="65" y1="50" x2="105" y2="25" strokeWidth="0.8" opacity="0.2"/>
                            <line x1="65" y1="50" x2="112" y2="70" strokeWidth="0.7" opacity="0.18"/>
                            <line x1="65" y1="50" x2="22" y2="72" strokeWidth="0.7" opacity="0.18"/>
                            <line x1="65" y1="50" x2="65" y2="90" strokeWidth="0.7" opacity="0.16"/>
                            <line x1="65" y1="50" x2="10" y2="47" strokeWidth="0.6" opacity="0.14"/>
                            <line x1="65" y1="50" x2="120" y2="47" strokeWidth="0.6" opacity="0.14"/>
                            <circle cx="65" cy="50" r="28" strokeWidth="0.6" strokeDasharray="3 3" opacity="0.18"/>
                          </svg>
                        }
                        title="No customers yet"
                        body="Connect a messaging channel so customers can reach you — they'll appear here automatically."
                        action={{ label: 'Connect a channel →', href: '/settings/channels' }}
                      />
                    </div>
                  </td>
                </tr>
              )}
              {customers.length === 0 && (totalCount ?? 0) === 0 && hasChannels && (
                <tr>
                  <td colSpan={99} style={{ padding: 0 }}>
                    <div className="pt-empty-page" style={{ minHeight: 360 }}>
                      <EmptyState
                        size="lg"
                        icon={
                          <svg width="130" height="100" viewBox="0 0 130 100" fill="none" stroke="currentColor" strokeLinecap="round">
                            <circle cx="65" cy="50" r="11" strokeWidth="1.2"/>
                            <circle cx="25" cy="22" r="8" strokeWidth="1" opacity="0.45"/>
                            <circle cx="105" cy="25" r="8" strokeWidth="1" opacity="0.45"/>
                            <circle cx="112" cy="70" r="7" strokeWidth="0.9" opacity="0.35"/>
                            <circle cx="22" cy="72" r="7" strokeWidth="0.9" opacity="0.35"/>
                            <circle cx="65" cy="90" r="6" strokeWidth="0.9" opacity="0.3"/>
                            <circle cx="10" cy="47" r="5" strokeWidth="0.8" opacity="0.22"/>
                            <circle cx="120" cy="47" r="5" strokeWidth="0.8" opacity="0.22"/>
                            <line x1="65" y1="50" x2="25" y2="22" strokeWidth="0.8" opacity="0.2"/>
                            <line x1="65" y1="50" x2="105" y2="25" strokeWidth="0.8" opacity="0.2"/>
                            <line x1="65" y1="50" x2="112" y2="70" strokeWidth="0.7" opacity="0.18"/>
                            <line x1="65" y1="50" x2="22" y2="72" strokeWidth="0.7" opacity="0.18"/>
                            <line x1="65" y1="50" x2="65" y2="90" strokeWidth="0.7" opacity="0.16"/>
                            <line x1="65" y1="50" x2="10" y2="47" strokeWidth="0.6" opacity="0.14"/>
                            <line x1="65" y1="50" x2="120" y2="47" strokeWidth="0.6" opacity="0.14"/>
                            <circle cx="65" cy="50" r="28" strokeWidth="0.6" strokeDasharray="3 3" opacity="0.18"/>
                          </svg>
                        }
                        title="No customers yet"
                        body="Customers are added automatically when they contact you through any connected channel."
                      />
                    </div>
                  </td>
                </tr>
              )}
              {customers.length === 0 && (totalCount ?? 0) > 0 && (
                <tr>
                  <td colSpan={99} style={{ padding: 0 }}>
                    <div className="pt-empty-page" style={{ minHeight: 360 }}>
                      <EmptyState
                        size="lg"
                        icon={
                          <svg width="80" height="64" viewBox="0 0 80 64" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="32" cy="26" r="16" strokeWidth="1.2"/>
                            <line x1="43" y1="37" x2="58" y2="52" strokeWidth="2" strokeLinecap="round"/>
                            <line x1="26" y1="26" x2="38" y2="26" strokeWidth="1.2" opacity="0.4"/>
                            <line x1="32" y1="20" x2="32" y2="32" strokeWidth="1.2" opacity="0.4"/>
                            <circle cx="32" cy="26" r="2" fill="currentColor" stroke="none" opacity="0.3"/>
                          </svg>
                        }
                        title="No results found"
                        body="Try a different search or clear your filters."
                        action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
                      />
                    </div>
                  </td>
                </tr>
              )}
              {customers.map(c => {
                const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
                const chKey = primary ? CH_KEY[primary.channel_type] : 'wa'
                const ChIcon = primary ? CH_ICONS[primary.channel_type] : null
                const trustCls = c.trust_score >= 85 ? 'hi' : c.trust_score >= 65 ? 'md' : 'lo'
                const tags = c.customer_tags.map(t => t.tag)
                const supply = supplyStatuses[c.id]
                const stats = orderStats[c.id]

                return (
                  <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)}>
                    <td>
                      <div className="pt-cl-cust">
                        <div className="pt-thread-av" data-channel={chKey}>
                          <span>{initials(c.display_name)}</span>
                          <i className={`pt-thread-ch pt-ch-${chKey}`}>{ChIcon && <ChIcon size={9} />}</i>
                        </div>
                        <div className="pt-cl-name">
                          {c.display_name}
                          {tags.includes('vip')     && <span className="pt-tag pt-tag-vip">VIP</span>}
                          {tags.includes('new')     && <span className="pt-tag pt-tag-new">new</span>}
                          {tags.includes('repeat')  && !tags.includes('vip') && <span className="pt-tag pt-tag-soft">repeat</span>}
                          {tags.includes('payment') && <span className="pt-tag pt-tag-warn">payment</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`pt-cl-ch-icon pt-ch-${chKey}`}>
                        {ChIcon && <ChIcon size={14} />}
                      </span>
                    </td>
                    <td className="pt-cl-handle mono">{primary?.display_handle ?? '—'}</td>
                    <td className="r pt-cl-ltv">{formatAmount(c.ltv, baseCurrency)}</td>
                    <td className="r pt-cl-order-count">{stats?.count ?? '—'}</td>
                    <td className="pt-cl-last-order">
                      {stats?.lastOrderAt ? fmtLastOrder(stats.lastOrderAt) : <span className="pt-cl-no-supply">—</span>}
                    </td>
                    <td><span className={`pt-trust-pill pt-trust-${trustCls}`}>{c.trust_score}</span></td>
                    <td>
                      {supply ? (
                        <div className="pt-cu-supply">
                          <div className={`pt-cu-supply-dot is-${supply}`} />
                          <span className={`pt-cu-supply-lbl is-${supply}`}>
                            {supply === 'ok' ? 'ok' : supply === 'low' ? 'low' : 'out'}
                          </span>
                        </div>
                      ) : <span className="pt-cl-no-supply">—</span>}
                    </td>
                    <td>
                      <div className="pt-cl-actions">
                        <Link
                          href={`/customers/${c.id}`}
                          className="pt-btn pt-btn-ghost"
                          style={{ fontSize: 11 }}
                          onClick={e => e.stopPropagation()}
                        >
                          Open
                        </Link>
                        <Link
                          href="/inbox"
                          className="pt-btn pt-btn-ghost"
                          style={{ fontSize: 11 }}
                          onClick={e => e.stopPropagation()}
                        >
                          Message
                        </Link>
                      </div>
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
