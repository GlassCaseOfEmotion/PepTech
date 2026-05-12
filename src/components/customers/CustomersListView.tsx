'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
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
}

export function CustomersListView({ customers, supplyStatuses = {}, orderStats = {} }: Props) {
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const router = useRouter()

  // Counts for filter pills (always from full list)
  const chCounts: Record<string, number> = { whatsapp: 0, telegram: 0, email: 0 }
  const tagCounts: Record<string, number> = { vip: 0, new: 0, payment: 0, low_supply: 0 }
  for (const c of customers) {
    const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
    if (primary?.channel_type in chCounts) chCounts[primary.channel_type]++
    const tags = c.customer_tags.map(t => t.tag)
    if (tags.includes('vip'))     tagCounts.vip++
    if (tags.includes('new'))     tagCounts.new++
    if (tags.includes('payment')) tagCounts.payment++
    const s = supplyStatuses[c.id]
    if (s === 'low' || s === 'critical') tagCounts.low_supply++
  }

  const filtered = customers.filter(c => {
    if (search) {
      const q = search.toLowerCase()
      const handle = c.customer_channels.find(ch => ch.is_primary)?.display_handle ?? ''
      if (!c.display_name.toLowerCase().includes(q) && !handle.toLowerCase().includes(q)) return false
    }
    if (channelFilter) {
      const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
      if (!primary || primary.channel_type !== channelFilter) return false
    }
    if (tagFilter) {
      const tags = c.customer_tags.map(t => t.tag)
      if (tagFilter === 'low_supply') {
        const s = supplyStatuses[c.id]
        if (s !== 'low' && s !== 'critical') return false
      } else {
        if (!tags.includes(tagFilter)) return false
      }
    }
    return true
  })

  return (
    <div className="pt-page">
      <div className="pt-page-hd">
        <div>
          <h1>Customers</h1>
          <p>{customers.length} contacts across all channels</p>
        </div>
        <div className="pt-page-actions">
          <div className="pt-or-search">
            <Icons.search size={12} />
            <input
              placeholder="Search by name or handle…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="pt-btn pt-btn-primary"><Icons.plus size={12} /> New customer</button>
        </div>
      </div>

      <div className="pt-cl-filters">
        <div className="pt-pillbar">
          <button className={`pt-pill ${!channelFilter ? 'is-on' : ''}`} onClick={() => setChannelFilter(null)}>
            All <span className="pt-pill-num">{customers.length}</span>
          </button>
          {chCounts.whatsapp > 0 && (
            <button className={`pt-pill ${channelFilter === 'whatsapp' ? 'is-on' : ''}`} onClick={() => setChannelFilter(channelFilter === 'whatsapp' ? null : 'whatsapp')}>
              <Icons.wa size={11} /> WhatsApp <span className="pt-pill-num">{chCounts.whatsapp}</span>
            </button>
          )}
          {chCounts.telegram > 0 && (
            <button className={`pt-pill ${channelFilter === 'telegram' ? 'is-on' : ''}`} onClick={() => setChannelFilter(channelFilter === 'telegram' ? null : 'telegram')}>
              <Icons.tg size={11} /> Telegram <span className="pt-pill-num">{chCounts.telegram}</span>
            </button>
          )}
          {chCounts.email > 0 && (
            <button className={`pt-pill ${channelFilter === 'email' ? 'is-on' : ''}`} onClick={() => setChannelFilter(channelFilter === 'email' ? null : 'email')}>
              <Icons.em size={11} /> Email <span className="pt-pill-num">{chCounts.email}</span>
            </button>
          )}
        </div>
        <div className="pt-pillbar">
          {tagCounts.vip > 0 && (
            <button className={`pt-pill ${tagFilter === 'vip' ? 'is-on' : ''}`} onClick={() => setTagFilter(tagFilter === 'vip' ? null : 'vip')}>
              VIP <span className="pt-pill-num">{tagCounts.vip}</span>
            </button>
          )}
          {tagCounts.payment > 0 && (
            <button className={`pt-pill ${tagFilter === 'payment' ? 'is-on' : ''}`} onClick={() => setTagFilter(tagFilter === 'payment' ? null : 'payment')}>
              Payment <span className="pt-pill-num">{tagCounts.payment}</span>
            </button>
          )}
          {tagCounts.low_supply > 0 && (
            <button className={`pt-pill ${tagFilter === 'low_supply' ? 'is-on' : ''}`} onClick={() => setTagFilter(tagFilter === 'low_supply' ? null : 'low_supply')}>
              Low supply <span className="pt-pill-num">{tagCounts.low_supply}</span>
            </button>
          )}
          {tagCounts.new > 0 && (
            <button className={`pt-pill ${tagFilter === 'new' ? 'is-on' : ''}`} onClick={() => setTagFilter(tagFilter === 'new' ? null : 'new')}>
              New <span className="pt-pill-num">{tagCounts.new}</span>
            </button>
          )}
        </div>
      </div>

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
                {filtered.map(c => {
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
                      <td className="r pt-cl-ltv">${c.ltv.toLocaleString()}</td>
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
    </div>
  )
}
