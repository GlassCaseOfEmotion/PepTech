'use client'

import { useState, useEffect, useRef, useCallback, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icons } from '@/lib/icons'
import { createOrFindConversation } from '@/app/inbox/actions'

type CustomerHit = {
  id: string
  display_name: string
  customer_channels: { channel_type: string; display_handle: string; is_primary: boolean }[]
}

const CH_NAMES: Record<string, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Email' }
const CH_ICONS: Record<string, string> = { whatsapp: '📱', telegram: '✈️', email: '✉️' }

export function ComposeModal() {
  const [open, setOpen] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerHit[]>([])
  const [selected, setSelected] = useState<CustomerHit | null>(null)
  const [channelType, setChannelType] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Open via sidebar button or C key
  useEffect(() => {
    const openHandler = () => { setOpen(true) }
    const keyHandler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (
        e.key === 'c' &&
        tag !== 'INPUT' &&
        tag !== 'TEXTAREA' &&
        !(e.target as HTMLElement).isContentEditable &&
        !e.metaKey && !e.ctrlKey
      ) {
        setOpen(true)
      }
      if (e.key === 'Escape') { setOpen(false); reset() }
    }
    window.addEventListener('pt:compose:open', openHandler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('pt:compose:open', openHandler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const reset = useCallback(() => {
    setCustomerQuery(''); setCustomers([]); setSelected(null)
    setChannelType(''); setMessage(''); setError(null)
  }, [])

  const close = () => { setOpen(false); reset() }

  // Customer search
  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setCustomers([]); return }
    const { data } = await supabase
      .from('customers')
      .select('id, display_name, customer_channels(channel_type, display_handle, is_primary)')
      .ilike('display_name', `%${q}%`)
      .limit(8)
    setCustomers((data ?? []) as CustomerHit[])
  }, [supabase])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchCustomers(customerQuery), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [customerQuery, searchCustomers])

  const selectCustomer = (c: CustomerHit) => {
    setSelected(c)
    setCustomers([])
    setCustomerQuery('')
    const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
    setChannelType(primary?.channel_type ?? '')
  }

  const send = () => {
    if (!selected || !channelType || !message.trim()) { setError('Please fill in all fields'); return }
    setError(null)
    startTransition(async () => {
      const result = await createOrFindConversation(selected.id, channelType)
      if ('error' in result) { setError(result.error); return }

      // Navigate immediately — fire send in background, inbox real-time will pick it up
      const conversationId = result.conversationId
      const content = message.trim()
      close()
      router.push(`/inbox?conversation=${conversationId}`)
      void fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, content }),
      })
    })
  }

  if (!open) return null

  return (
    <div className="pt-modal-backdrop" onClick={close}>
      <div className="pt-modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h3>New message</h3>
          <button className="pt-iconbtn" onClick={close}><Icons.x size={14} /></button>
        </div>

        <div className="pt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* To field */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>To</div>
            {selected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px 4px 7px', borderRadius: 20, background: 'oklch(from var(--pt-accent) l c h / 0.15)', border: '0.5px solid oklch(from var(--pt-accent) l c h / 0.4)', fontSize: 13 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--pt-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>
                    {selected.display_name.slice(0, 2).toUpperCase()}
                  </div>
                  <span>{selected.display_name}</span>
                  <button onClick={() => { setSelected(null); setChannelType('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pt-fg-4)', fontSize: 13, padding: 0 }}>✕</button>
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  className="pt-input"
                  placeholder="Search customers…"
                  value={customerQuery}
                  onChange={e => setCustomerQuery(e.target.value)}
                />
                {customers.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--pt-bg-side)', border: '0.5px solid var(--pt-line)', borderRadius: 6, marginTop: 2, overflow: 'hidden' }}>
                    {customers.map(c => {
                      const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
                      return (
                        <div key={c.id}
                          style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}
                          onMouseDown={e => { e.preventDefault(); selectCustomer(c) }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(from var(--pt-fg) l c h / 0.06)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                        >
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pt-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                            {c.display_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{c.display_name}</div>
                            {primary && <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', fontFamily: 'var(--pt-mono)' }}>{primary.display_handle} · {CH_NAMES[primary.channel_type] ?? primary.channel_type}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Channel selector (shown when customer selected and has multiple channels) */}
          {selected && selected.customer_channels.length > 1 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Via</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {selected.customer_channels.map(ch => (
                  <button key={ch.channel_type}
                    className={`pt-btn ${channelType === ch.channel_type ? 'pt-btn-primary' : 'pt-btn-ghost'}`}
                    style={{ fontSize: 12 }}
                    onClick={() => setChannelType(ch.channel_type)}
                  >
                    {CH_ICONS[ch.channel_type]} {CH_NAMES[ch.channel_type] ?? ch.channel_type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Message</div>
            <textarea
              className="pt-od-notes"
              placeholder="Write your message…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={4}
              disabled={!selected}
            />
            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', textAlign: 'right', marginTop: 3 }}>Enter to send · Shift+Enter for new line</div>
          </div>

          {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)', margin: 0 }}>{error}</p>}
        </div>

        <div className="pt-modal-ft">
          <button className="pt-btn pt-btn-ghost" onClick={close} disabled={pending}>Cancel</button>
          <button className="pt-btn pt-btn-primary" onClick={send} disabled={pending || !selected || !channelType || !message.trim()}>
            {pending ? 'Sending…' : `Send via ${(CH_NAMES[channelType] ?? channelType) || '…'} →`}
          </button>
        </div>
      </div>
    </div>
  )
}
