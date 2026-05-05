'use client'

import { useState, useCallback } from 'react'
import { Icons } from '@/lib/icons'
import { createOrder } from '@/app/orders/actions'

type ProductOption = {
  id: string; sku: string; name: string; product_family: string; unit_price: number
}

type LineItem = {
  key: number; productId: string; productName: string; qty: number; unitPrice: number
}

interface CreateOrderFormProps {
  customerId?: string
  customerName?: string
  conversationId?: string
  onSuccess: (orderId: string, refNumber: string) => void
  onCancel: () => void
}

export function CreateOrderForm({ customerId, customerName, conversationId, onSuccess, onCancel }: CreateOrderFormProps) {
  const [items, setItems] = useState<LineItem[]>([{ key: 0, productId: '', productName: '', qty: 1, unitPrice: 0 }])
  const [paymentAsset, setPaymentAsset] = useState('USDT')
  const [paymentAddress, setPaymentAddress] = useState('')
  const [address, setAddress] = useState({ ln1: '', ln2: '', city: '', state: '', zip: '' })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [searchResults, setSearchResults] = useState<ProductOption[]>([])
  const [activeItemKey, setActiveItemKey] = useState<number | null>(null)
  const [resolvedCustomerId, setResolvedCustomerId] = useState(customerId ?? '')

  const searchProducts = useCallback(async (q: string, itemKey: number) => {
    setActiveItemKey(itemKey)
    if (!q.trim()) { setSearchResults([]); return }
    const res = await fetch(`/api/catalog/products?q=${encodeURIComponent(q)}`)
    if (res.ok) setSearchResults(await res.json() as ProductOption[])
  }, [])

  const selectProduct = (product: ProductOption, itemKey: number) => {
    setItems(prev => prev.map(it => it.key === itemKey
      ? { ...it, productId: product.id, productName: product.name, unitPrice: product.unit_price }
      : it
    ))
    setSearchResults([])
    setActiveItemKey(null)
  }

  const addItem = () => setItems(prev => [...prev, { key: Date.now(), productId: '', productName: '', qty: 1, unitPrice: 0 }])
  const removeItem = (key: number) => setItems(prev => prev.filter(it => it.key !== key))
  const updateItemQty = (key: number, qty: number) =>
    setItems(prev => prev.map(it => it.key === key ? { ...it, qty } : it))

  const total = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)

  const submit = async () => {
    if (!resolvedCustomerId) { setError('Customer is required'); return }
    const unselected = items.find(it => !it.productId)
    if (unselected) { setError('All line items must have a product selected'); return }
    setError('')
    setSubmitting(true)
    const result = await createOrder({
      customerId: resolvedCustomerId,
      conversationId,
      paymentAsset,
      paymentAmount: total,
      paymentAddress: paymentAddress || undefined,
      shippingAddress: address.ln1 ? { ...address } : undefined,
      notes: notes || undefined,
      items: items.map(it => ({ productId: it.productId, qty: it.qty, unitPriceSnapshot: it.unitPrice })),
    })
    setSubmitting(false)
    if ('error' in result) { setError(result.error); return }
    onSuccess(result.orderId, result.refNumber)
  }

  return (
    <div className="pt-create-order">
      {/* Customer */}
      {!customerId && (
        <div className="pt-co-section">
          <div className="pt-co-lbl">Customer ID</div>
          <input
            className="pt-input"
            placeholder="Paste customer ID from Customers page…"
            value={resolvedCustomerId}
            onChange={e => setResolvedCustomerId(e.target.value)}
          />
        </div>
      )}
      {customerId && customerName && (
        <div className="pt-co-section">
          <div className="pt-co-lbl">Customer</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{customerName}</div>
        </div>
      )}

      {/* Line items */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Line items</div>
        {items.map(it => (
          <div key={it.key} className="pt-co-item">
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                className="pt-input"
                placeholder="Search product (SKU or name)…"
                value={it.productName}
                onChange={e => {
                  const name = e.target.value
                  setItems(prev => prev.map(x => x.key === it.key ? { ...x, productName: name, productId: '' } : x))
                  void searchProducts(name, it.key)
                }}
              />
              {activeItemKey === it.key && searchResults.length > 0 && (
                <div className="pt-co-dropdown">
                  {searchResults.map(p => (
                    <button key={p.id} className="pt-co-dropdown-item" onClick={() => selectProduct(p, it.key)}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--pt-fg-3)' }}>{p.sku}</span>
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <span className="mono" style={{ fontSize: 11 }}>${p.unit_price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              className="pt-input"
              style={{ width: 64, textAlign: 'right' }}
              type="number" min="1" value={it.qty}
              onChange={e => updateItemQty(it.key, Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
            <span className="mono" style={{ fontSize: 12, minWidth: 64, textAlign: 'right', color: it.unitPrice ? 'var(--pt-fg)' : 'var(--pt-fg-4)' }}>
              {it.unitPrice ? `$${(it.qty * it.unitPrice).toFixed(2)}` : '—'}
            </span>
            {items.length > 1 && (
              <button className="pt-iconbtn" onClick={() => removeItem(it.key)} title="Remove">
                <Icons.x size={12} />
              </button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <button className="pt-link" style={{ fontSize: 12 }} onClick={addItem}>+ Add item</button>
          <div className="pt-co-total">Total <span className="mono">${total.toFixed(2)}</span></div>
        </div>
      </div>

      {/* Payment */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Payment</div>
        <div className="pt-co-row">
          <select className="pt-input" style={{ flex: '0 0 100px' }} value={paymentAsset} onChange={e => setPaymentAsset(e.target.value)}>
            <option>USDT</option>
            <option>BTC</option>
            <option>XMR</option>
            <option>Cash</option>
            <option>Other</option>
          </select>
          <input
            className="pt-input"
            placeholder="Receiving address (optional)"
            value={paymentAddress}
            onChange={e => setPaymentAddress(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      {/* Shipping */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Shipping address <span style={{ color: 'var(--pt-fg-4)', fontWeight: 400 }}>(optional)</span></div>
        <div className="pt-cat-form-grid">
          <input className="pt-input" placeholder="Street address" value={address.ln1} onChange={e => setAddress(a => ({ ...a, ln1: e.target.value }))} />
          <input className="pt-input" placeholder="Apt / unit" value={address.ln2} onChange={e => setAddress(a => ({ ...a, ln2: e.target.value }))} />
          <input className="pt-input" placeholder="City" value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))} />
          <input className="pt-input" placeholder="State" value={address.state} onChange={e => setAddress(a => ({ ...a, state: e.target.value }))} />
        </div>
        <input className="pt-input" style={{ marginTop: 8, width: 120 }} placeholder="ZIP" value={address.zip} onChange={e => setAddress(a => ({ ...a, zip: e.target.value }))} />
      </div>

      {/* Notes */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Notes <span style={{ color: 'var(--pt-fg-4)', fontWeight: 400 }}>(operator only)</span></div>
        <textarea className="pt-od-notes" style={{ minHeight: 48 }} placeholder="Internal notes…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--pt-danger)', marginBottom: 4 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="pt-btn pt-btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button className="pt-btn pt-btn-primary" onClick={submit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create order'}
        </button>
      </div>
    </div>
  )
}
