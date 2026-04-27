'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Icons } from '@/lib/icons'
import { MOCK_THREADS } from '@/lib/mock-data'

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0]]).join('')
}

export function CustomersListView() {
  const [search, setSearch] = useState('')
  const filtered = MOCK_THREADS.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.handle.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="pt-page">
      <div className="pt-page-hd">
        <div>
          <h1>Customers</h1>
          <p>{MOCK_THREADS.length} contacts across all channels</p>
        </div>
        <div className="pt-page-actions">
          <div className="pt-or-search">
            <Icons.search size={12} />
            <input placeholder="Search by name or handle…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="pt-btn pt-btn-primary"><Icons.plus size={12} /> New customer</button>
        </div>
      </div>

      <div className="pt-grid" style={{ gridTemplateColumns: '1fr' }}>
        <section className="pt-card">
          <div className="pt-card-body">
            <ul className="pt-thread-list">
              {filtered.map(t => {
                const ChIcon = CH_ICONS[t.channel]
                const trustCls = t.trust >= 85 ? 'hi' : t.trust >= 65 ? 'md' : 'lo'
                return (
                  <li key={t.id} className="pt-thread">
                    <div className="pt-thread-av" data-channel={t.channel}>
                      <span>{initials(t.name)}</span>
                      <i className={`pt-thread-ch pt-ch-${t.channel}`}>{ChIcon && <ChIcon size={9} />}</i>
                    </div>
                    <div className="pt-thread-mid">
                      <div className="pt-thread-row1">
                        <span className="pt-thread-name">{t.name}</span>
                        {t.tags.includes('vip') && <span className="pt-tag pt-tag-vip">VIP</span>}
                        {t.tags.includes('new') && <span className="pt-tag pt-tag-new">new</span>}
                        {t.tags.includes('repeat') && !t.tags.includes('vip') && <span className="pt-tag pt-tag-soft">repeat</span>}
                      </div>
                      <div className="pt-thread-snip">LTV ${t.ltv.toLocaleString()} · last {t.lastOrder} · trust {t.trust}</div>
                    </div>
                    <div className="pt-thread-meta">
                      <div className={`pt-trust-pill pt-trust-${trustCls}`}>{t.trust}</div>
                      <Link href={`/inbox`} className="pt-link" style={{ fontSize: 11, marginTop: 4 }}>Message →</Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
