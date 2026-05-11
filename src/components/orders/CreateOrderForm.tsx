'use client'

import { useState, useEffect } from 'react'
import { createOrder } from '@/app/orders/actions'

type ProductOption = {
  id: string; sku: string; name: string; product_family: string; unit_price: number
}

interface CreateOrderFormProps {
  customerId?: string
  customerName?: string
  conversationId?: string
  onSuccess: (orderId: string, refNumber: string) => void
  onCancel: () => void
}

export function CreateOrderForm({ customerId, customerName, conversationId, onSuccess, onCancel }: CreateOrderFormProps) {
  const [products, setProducts] = useState<ProductOption[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [paymentAsset, setPaymentAsset] = useState('cash')
  const [paymentAddress, setPaymentAddress] = useState('')
  const [paymentConfigs, setPaymentConfigs] = useState<{ type: string; wallet_address: string | null; is_active: boolean }[]>([])
  const [address, setAddress] = useState({ ln1: '', ln2: '', city: '', state: '', zip: '' })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [resolvedCustomerId, setResolvedCustomerId] = useState(customerId ?? '')

  useEffect(() => {
    fetch('/api/catalog/products')
      .then(r => r.json())
      .then((data: ProductOption[]) => setProducts(data))
      .catch(() => {/* non-critical */})
  }, [])

  useEffect(() => {
    fetch('/api/payments/configs')
      .then(r => r.json())
      .then((data: { type: string; wallet_address: string | null; is_active: boolean }[]) => {
        setPaymentConfigs(data.filter(c => c.is_active))
      })
      .catch(() => {})
  }, [])

  const setQty = (productId: string, qty: number) => {
    setQuantities(prev =>
      qty > 0
        ? { ...prev, [productId]: qty }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== productId))
    )
  }

  const families = [...new Set(products.map(p => p.product_family))]
  const byFamily = Object.fromEntries(families.map(f => [f, products.filter(p => p.product_family === f)]))

  const selectedItems = products.filter(p => (quantities[p.id] ?? 0) > 0)
  const total = selectedItems.reduce((s, p) => s + (quantities[p.id] ?? 0) * p.unit_price, 0)

  const paymentOptions = (() => {
    const opts: { value: string; label: string }[] = [{ value: 'cash', label: 'Cash' }]
    for (const c of paymentConfigs) {
      const labels: Record<string, string> = {
        usdt_trc20: 'USDT (TRC20)', btc: 'BTC', eth: 'ETH',
        usdc_erc20: 'USDC (ERC20)', ltc: 'LTC', xmr: 'XMR',
        bank_transfer: 'Bank Transfer',
      }
      if (labels[c.type]) opts.push({ value: c.type, label: labels[c.type] })
    }
    if (paymentConfigs.filter(c => c.type !== 'cash').length >= 2) {
      opts.push({ value: 'customer_chooses', label: 'Customer chooses' })
    }
    return opts
  })()

  const submit = async () => {
    if (!resolvedCustomerId) { setError('Customer is required'); return }
    if (selectedItems.length === 0) { setError('Add at least one product'); return }
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
      items: selectedItems.map(p => ({
        productId: p.id,
        qty: quantities[p.id] ?? 1,
        unitPriceSnapshot: p.unit_price,
      })),
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

      {/* Product picker */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Products</div>
        {products.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--pt-fg-4)', padding: '4px 0' }}>Loading…</div>
        ) : (
          <div className="pt-co-products">
            {families.map(family => (
              <div key={family}>
                <div className="pt-co-family-hd">{family}</div>
                {byFamily[family].map(p => {
                  const qty = quantities[p.id] ?? 0
                  return (
                    <div key={p.id} className={`pt-co-product ${qty > 0 ? 'is-selected' : ''}`}>
                      <div className="pt-co-product-info">
                        <div className="pt-co-product-name">{p.name}</div>
                        <div className="pt-co-product-meta mono">{p.sku} · ${p.unit_price}</div>
                      </div>
                      <div className="pt-co-product-right">
                        {qty > 0 && (
                          <span className="pt-co-product-subtotal mono">${(qty * p.unit_price).toFixed(0)}</span>
                        )}
                        {qty === 0 ? (
                          <button className="pt-co-add-btn" onClick={() => setQty(p.id, 1)}>+ Add</button>
                        ) : (
                          <div className="pt-co-stepper">
                            <button className="pt-co-stepper-btn" onClick={() => setQty(p.id, qty - 1)}>−</button>
                            <span className="pt-co-stepper-qty">{qty}</span>
                            <button className="pt-co-stepper-btn" onClick={() => setQty(p.id, qty + 1)}>+</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        {selectedItems.length > 0 && (
          <div className="pt-co-total">
            <span className="pt-co-total-lbl">{selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}</span>
            <span className="mono">${total.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Payment */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Payment</div>
        <div className="pt-co-row">
          <select
            className="pt-input"
            style={{ flex: '0 0 160px' }}
            value={paymentAsset}
            onChange={e => {
              const type = e.target.value
              setPaymentAsset(type)
              const cfg = paymentConfigs.find(c => c.type === type)
              setPaymentAddress(cfg?.wallet_address ?? '')
            }}
          >
            {paymentOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {paymentAddress && (
            <input
              className="pt-input mono"
              style={{ flex: 1, fontSize: 11 }}
              value={paymentAddress}
              readOnly
              title="Receiving address (auto-filled from your wallet config)"
            />
          )}
        </div>
        {paymentConfigs.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 4 }}>
            Configure payment methods in Settings → Wallets &amp; Assets
          </p>
        )}
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

      {error && <div style={{ fontSize: 12, color: 'var(--pt-danger)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="pt-btn pt-btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button className="pt-btn pt-btn-primary" onClick={submit} disabled={submitting || selectedItems.length === 0}>
          {submitting ? 'Creating…' : 'Create order'}
        </button>
      </div>
    </div>
  )
}
