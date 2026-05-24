'use client'

import { useState, useMemo } from 'react'
import { Icons } from '@/lib/icons'
import { LeadsTable } from './LeadsTable'
import { CustomersTable } from './CustomersTable'
import type { SupplyStatus } from '@/types/protocols'

type Channel = { channel_type: string; display_handle: string; is_primary: boolean }
type Tag = { tag: string }

type Contact = {
  id: string
  display_name: string
  trust_score: number
  ltv: number
  lifecycle_stage: 'lead' | 'customer'
  acquisition_source: 'referral' | 'community' | 'group_chat' | 'direct' | 'other' | null
  acquisition_source_note: string | null
  referred_by_customer_id: string | null
  converted_at: string | null
  created_at: string
  customer_channels: Channel[]
  customer_tags: Tag[]
}

interface Props {
  customers: Contact[]
  supplyStatuses?: Record<string, SupplyStatus | null>
  orderStats?: Record<string, { count: number; lastOrderAt: string | null }>
  baseCurrency: string
  hasChannels?: boolean
  recentConvByCustomer: Record<string, { channelType: string; lastMessageAt: string | null }>
}

export function ContactsListView({
  customers,
  supplyStatuses = {},
  orderStats = {},
  baseCurrency,
  hasChannels = false,
  recentConvByCustomer,
}: Props) {
  const [tab, setTab]                       = useState<'leads' | 'customers'>('leads')
  const [search, setSearch]                 = useState('')
  const [channelFilter, setChannelFilter]   = useState<string | null>(null)
  const [tagFilter, setTagFilter]           = useState<string | null>(null)
  const [noSourceOnly, setNoSourceOnly]     = useState(false)

  // Counts for filter pills (always from full list for the active tab's superset)
  const chCounts: Record<string, number> = { whatsapp: 0, telegram: 0, email: 0 }
  const tagCounts: Record<string, number> = { vip: 0, new: 0, payment: 0, low_supply: 0 }
  for (const c of customers) {
    const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
    if (primary?.channel_type && primary.channel_type in chCounts) chCounts[primary.channel_type]++
    const tags = c.customer_tags.map(t => t.tag)
    if (tags.includes('vip'))     tagCounts.vip++
    if (tags.includes('new'))     tagCounts.new++
    if (tags.includes('payment')) tagCounts.payment++
    const s = supplyStatuses[c.id]
    if (s === 'low' || s === 'critical') tagCounts.low_supply++
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return customers.filter(c => {
      if (q) {
        const handle = c.customer_channels.find(ch => ch.is_primary)?.display_handle ?? ''
        if (!c.display_name.toLowerCase().includes(q) && !handle.toLowerCase().includes(q)) return false
      }
      if (channelFilter) {
        const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
        if (!primary || primary.channel_type !== channelFilter) return false
      }
      if (tagFilter) {
        if (tagFilter === 'low_supply') {
          const s = supplyStatuses[c.id]
          if (s !== 'low' && s !== 'critical') return false
        } else {
          const tags = c.customer_tags.map(t => t.tag)
          if (!tags.includes(tagFilter)) return false
        }
      }
      return true
    })
  }, [customers, search, channelFilter, tagFilter, supplyStatuses])

  const leads  = filtered.filter(c => c.lifecycle_stage === 'lead'
    && (!noSourceOnly || c.acquisition_source === null))
  const buyers = filtered.filter(c => c.lifecycle_stage === 'customer')

  function clearFilters() {
    setSearch('')
    setChannelFilter(null)
    setTagFilter(null)
    setNoSourceOnly(false)
  }

  return (
    <div className="pt-page">
      <div className="pt-page-hd">
        <div>
          <h1>Contacts</h1>
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
        </div>
      </div>

      <div role="tablist" className="pt-contacts-tabs">
        <button
          role="tab"
          aria-selected={tab === 'leads'}
          className={`pt-contacts-tab${tab === 'leads' ? ' is-on' : ''}`}
          onClick={() => setTab('leads')}
        >
          Leads <span className="pt-pill-num">{leads.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'customers'}
          className={`pt-contacts-tab${tab === 'customers' ? ' is-on' : ''}`}
          onClick={() => setTab('customers')}
        >
          Customers <span className="pt-pill-num">{buyers.length}</span>
        </button>
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
          {tab === 'leads' && (
            <button
              className={`pt-pill ${noSourceOnly ? 'is-on' : ''}`}
              onClick={() => setNoSourceOnly(v => !v)}
            >
              No source set
            </button>
          )}
        </div>
      </div>

      {tab === 'leads' ? (
        <LeadsTable leads={leads} recentConvByCustomer={recentConvByCustomer} />
      ) : (
        <CustomersTable
          customers={buyers}
          supplyStatuses={supplyStatuses}
          orderStats={orderStats}
          baseCurrency={baseCurrency}
          hasChannels={hasChannels}
          onClearFilters={clearFilters}
          totalCount={customers.filter(c => c.lifecycle_stage === 'customer').length}
        />
      )}
    </div>
  )
}
