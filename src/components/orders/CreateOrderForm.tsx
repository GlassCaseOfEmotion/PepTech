'use client'

import { useState, useEffect, useRef } from 'react'
import { createOrder } from '@/app/orders/actions'
import { formatAmount } from '@/lib/currency'

type ProductOption = {
  id: string; sku: string; name: string; product_family: string; unit_price: number
}

type CustomerOption = { id: string; display_name: string }

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
  const [address, setAddress] = useState({ ln1: '', ln2: '', city: '', state: '', zip: '' })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [resolvedCustomerId, setResolvedCustomerId] = useState(customerId ?? '')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([])
  const [selectedCustomerName, setSelectedCustomerName] = useState(customerName ?? '')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [baseCurrency, setBaseCurrency]     = useState('USD')
  const customerSearchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/catalog/products')
      .then(r => r.json())
      .then((data: ProductOption[]) => setProducts(data))
      .catch(() => {/* non-critical */})
  }, [])

  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerResults([]); return }
    const timer = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(customerSearch)}`)
        .then(r => r.json())
        .then((data: CustomerOption[]) => setCustomerResults(data))
        .catch(() => {})
    }, 250)
    return () => clearTimeout(timer)
  }, [customerSearch])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch tenant base currency once on mount
  useEffect(() => {
    fetch('/api/tenant/currency')
      .then(r => r.json())
      .then((d: { base_currency: string }) => setBaseCurrency(d.base_currency))
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

  const submit = async () => {
    if (!resolvedCustomerId) { setError('Customer is required'); return }
    if (selectedItems.length === 0) { setError('Add at least one product'); return }
    setError('')
    setSubmitting(true)
    const result = await createOrder({
      customerId: resolvedCustomerId,
      conversationId,
      paymentAmount: total,
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
      <div className="pt-co-section">
        <div className="pt-co-lbl">Customer</div>
        {customerId ? (
          <div style={{ fontSize: 13, fontWeight: 500 }}>{customerName}</div>
        ) : (
          <div className="pt-co-customer-search" ref={customerSearchRef}>
            {selectedCustomerName ? (
              <div className="pt-co-customer-selected">
                <span style={{ fontSize: 13, fontWeight: 500 }}>{selectedCustomerName}</span>
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => { setSelectedCustomerName(''); setResolvedCustomerId(''); setCustomerSearch('') }}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  className="pt-input"
                  placeholder="Search customers…"
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true) }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  autoComplete="off"
                />
                {showCustomerDropdown && customerResults.length > 0 && (
                  <div className="pt-co-customer-dropdown">
                    {customerResults.map(c => (
                      <button
                        key={c.id}
                        className="pt-co-customer-option"
                        onMouseDown={e => {
                          e.preventDefault()
                          setResolvedCustomerId(c.id)
                          setSelectedCustomerName(c.display_name)
                          setCustomerSearch('')
                          setCustomerResults([])
                          setShowCustomerDropdown(false)
                        }}
                      >
                        {c.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

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
                        <div className="pt-co-product-meta mono">{p.sku} · {formatAmount(p.unit_price, baseCurrency)}</div>
                      </div>
                      <div className="pt-co-product-right">
                        {qty > 0 && (
                          <span className="pt-co-product-subtotal mono">{formatAmount(qty * p.unit_price, baseCurrency)}</span>
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
            <span className="mono">{formatAmount(total, baseCurrency)}</span>
          </div>
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
