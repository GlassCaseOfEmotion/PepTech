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

interface Props {
  customers: Customer[]
  supplyStatuses?: Record<string, SupplyStatus | null>
}

export function CustomersListView({ customers, supplyStatuses = {} }: Props) {
  const [search, setSearch] = useState('')
  const router = useRouter()

  const filtered = customers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    const handle = c.customer_channels.find(ch => ch.is_primary)?.display_handle ?? ''
    return c.display_name.toLowerCase().includes(q) || handle.toLowerCase().includes(q)
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

      <div className="pt-grid" style={{ gridTemplateColumns: '1fr' }}>
        <section className="pt-card">
          <div className="pt-card-body" style={{ padding: 0 }}>
            <table className="pt-cl">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th className="r">LTV</th>
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
                      <td className="pt-cl-handle mono">{primary?.display_handle ?? '—'}</td>
                      <td className="r pt-cl-ltv">${c.ltv.toLocaleString()}</td>
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
