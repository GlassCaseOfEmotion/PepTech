'use client'

import { useState, useEffect, useTransition } from 'react'
import { updateOrder } from '@/app/orders/actions'
import { PAYMENT_LABELS } from '@/types/payments'
import type { PaymentType, TenantPaymentConfig } from '@/types/payments'
import type { DbOrderRow } from '@/types/orders'
import { formatAmount } from '@/lib/currency'
import { Icons } from '@/lib/icons'

type ProductOption = { id: string; sku: string; name: string; product_family: string; unit_price: number }

interface EditOrderFormProps {
  order: DbOrderRow
  paymentConfigs: TenantPaymentConfig[]
  onSuccess: () => void
  onCancel: () => void
}

function LockedNotice({ reason }: { reason: string }) {
  return (
    <div className="pt-od-locked-notice">
      <Icons.lock size={11} />
      <span>{reason}</span>
    </div>
  )
}

export function EditOrderForm({ order, paymentConfigs, onSuccess, onCancel }: EditOrderFormProps) {
  // Build initial quantities and unit prices from existing order items
  const initQuantities: Record<string, number> = {}
  const initUnitPrices: Record<string, number> = {}
  for (const item of order.order_items) {
    if (item.products?.id) {
      initQuantities[item.products.id] = item.qty
      initUnitPrices[item.products.id] = item.unit_price_snapshot
    }
  }

  const [products, setProducts] = useState<ProductOption[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>(initQuantities)
  const [unitPrices, setUnitPrices] = useState<Record<string, number>>(initUnitPrices)
  const [paymentAsset, setPaymentAsset] = useState(order.payment_asset ?? '')
  const [paymentAmount, setPaymentAmount] = useState(order.payment_amount.toString())
  const [paymentAddress, setPaymentAddress] = useState(order.payment_address ?? '')
  const [shippingAddress, setShippingAddress] = useState({
    ln1: order.shipping_address?.ln1 ?? '',
    ln2: order.shipping_address?.ln2 ?? '',
    city: order.shipping_address?.city ?? '',
    state: order.shipping_address?.state ?? '',
    zip: order.shipping_address?.zip ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [baseCurrency, setBaseCurrency] = useState('USD')

  const canEditItems    = order.status === 'awaiting' || order.status === 'confirming'
  const canEditPayment  = order.status === 'awaiting' || order.status === 'confirming'
  const canEditPayAddr  = order.status === 'awaiting'
  const canEditShipping = order.status === 'awaiting' || order.status === 'confirming' || order.status === 'packing'

  useEffect(() => {
    if (!canEditItems) return
    fetch('/api/catalog/products')
      .then(r => r.json())
      .then((data: ProductOption[]) => setProducts(data))
      .catch(() => {})
  }, [canEditItems])

  useEffect(() => {
    fetch('/api/tenant/currency')
      .then(r => r.json())
      .then((d: { base_currency: string }) => setBaseCurrency(d.base_currency))
      .catch(() => {})
  }, [])

  const setQty = (productId: string, qty: number, catalogUnitPrice: number) => {
    setQuantities(prev =>
      qty > 0
        ? { ...prev, [productId]: qty }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== productId))
    )
    if (qty > 0 && !unitPrices[productId]) {
      setUnitPrices(prev => ({ ...prev, [productId]: catalogUnitPrice }))
    }
  }

  const paymentOptions = (() => {
    const opts: { value: string; label: string }[] = [{ value: 'cash', label: 'Cash' }]
    for (const c of paymentConfigs) {
      const label = PAYMENT_LABELS[c.type as PaymentType]
      if (label && c.type !== 'cash') opts.push({ value: c.type, label })
    }
    return opts
  })()

  const families = [...new Set(products.map(p => p.product_family))]
  const byFamily = Object.fromEntries(families.map(f => [f, products.filter(p => p.product_family === f)]))

  // For selected items count + total, use unitPrices (snapshot or catalog)
  const selectedProductIds = Object.entries(quantities).filter(([, qty]) => qty > 0).map(([id]) => id)
  const selectedCount = selectedProductIds.length
  const selectedTotal = selectedProductIds.reduce((sum, id) => {
    const price = unitPrices[id] ?? 0
    return sum + (quantities[id] ?? 0) * price
  }, 0)

  const submit = () => {
    const data: Parameters<typeof updateOrder>[1] = {}

    // Items diff
    if (canEditItems) {
      const origItems = order.order_items.map(it => ({
        productId: it.products?.id ?? '',
        qty: it.qty,
        unitPriceSnapshot: it.unit_price_snapshot,
      })).filter(it => it.productId)

      const newItems = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => ({
          productId,
          qty,
          unitPriceSnapshot: unitPrices[productId] ?? 0,
        }))

      const origSorted = JSON.stringify([...origItems].sort((a, b) => a.productId.localeCompare(b.productId)))
      const newSorted  = JSON.stringify([...newItems].sort((a, b) => a.productId.localeCompare(b.productId)))
      if (origSorted !== newSorted) {
        if (newItems.length === 0) { setError('Order must have at least one item'); return }
        data.items = newItems
      }
    }

    // Payment diff
    if (canEditPayment) {
      if (paymentAsset !== order.payment_asset) data.paymentAsset = paymentAsset ?? undefined
      const parsedAmount = parseFloat(paymentAmount)
      if (!isNaN(parsedAmount) && parsedAmount !== order.payment_amount) data.paymentAmount = parsedAmount
    }

    // Payment address diff (only if canEditPayAddr)
    if (canEditPayAddr) {
      const addr = paymentAddress.trim() || null
      if (addr !== order.payment_address) data.paymentAddress = addr
    }

    // Shipping diff
    if (canEditShipping) {
      const ln1 = shippingAddress.ln1.trim()
      const newShipping = ln1 ? {
        ln1,
        ln2: shippingAddress.ln2.trim() || undefined,
        city: shippingAddress.city.trim(),
        state: shippingAddress.state.trim(),
        zip: shippingAddress.zip.trim(),
      } : null

      const origShipping = order.shipping_address
      const shippingChanged = JSON.stringify(newShipping) !== JSON.stringify(origShipping ?? null)
      if (shippingChanged) data.shippingAddress = newShipping
    }

    if (Object.keys(data).length === 0) {
      setError('No changes to save')
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await updateOrder(order.id, data)
      if ('error' in result) {
        setError(result.error)
      } else {
        onSuccess()
      }
    })
  }

  return (
    <div className="pt-create-order">

      {/* Customer (read-only) */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Customer</div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{order.customers?.display_name ?? '—'}</div>
        <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 2 }}>Customer cannot be changed after creation.</div>
      </div>

      {/* Line items */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Products</div>
        {canEditItems ? (
          <div className="pt-co-products">
            {products.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--pt-fg-4)', padding: '4px 0' }}>Loading…</div>
            ) : (
              families.map(family => (
                <div key={family}>
                  <div className="pt-co-family-hd">{family}</div>
                  {byFamily[family].map(p => {
                    const qty = quantities[p.id] ?? 0
                    const displayPrice = unitPrices[p.id] ?? p.unit_price
                    return (
                      <div key={p.id} className={`pt-co-product ${qty > 0 ? 'is-selected' : ''}`}>
                        <div className="pt-co-product-info">
                          <div className="pt-co-product-name">{p.name}</div>
                          <div className="pt-co-product-meta mono">{p.sku} · {formatAmount(p.unit_price, baseCurrency)}</div>
                        </div>
                        <div className="pt-co-product-right">
                          {qty > 0 && (
                            <span className="pt-co-product-subtotal mono">{formatAmount(qty * displayPrice, baseCurrency)}</span>
                          )}
                          {qty === 0 ? (
                            <button className="pt-co-add-btn" onClick={() => setQty(p.id, 1, p.unit_price)}>+ Add</button>
                          ) : (
                            <div className="pt-co-stepper">
                              <button className="pt-co-stepper-btn" onClick={() => setQty(p.id, qty - 1, p.unit_price)}>−</button>
                              <span className="pt-co-stepper-qty">{qty}</span>
                              <button className="pt-co-stepper-btn" onClick={() => setQty(p.id, qty + 1, p.unit_price)}>+</button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        ) : (
          <LockedNotice reason={`Locked — order is ${order.status}. Line items cannot be changed after packing.`} />
        )}
        {canEditItems && selectedCount > 0 && (
          <div className="pt-co-total">
            <span className="pt-co-total-lbl">{selectedCount} item{selectedCount !== 1 ? 's' : ''}</span>
            <span className="mono">{formatAmount(selectedTotal, baseCurrency)}</span>
          </div>
        )}
      </div>

      {/* Payment */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Payment</div>
        {canEditPayment ? (
          <>
            <div className="pt-co-row" style={{ gap: 8, marginBottom: 8 }}>
              <select
                className="pt-input"
                style={{ flex: '0 0 160px' }}
                value={paymentAsset}
                onChange={e => {
                  const type = e.target.value
                  setPaymentAsset(type)
                  if (canEditPayAddr) {
                    const cfg = paymentConfigs.find(c => c.type === type)
                    setPaymentAddress(cfg?.wallet_address ?? '')
                  }
                }}
              >
                {paymentOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                className="pt-input mono"
                style={{ flex: '0 0 120px', textAlign: 'right' }}
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
              />
            </div>
            {canEditPayAddr ? (
              paymentAddress && (
                <input
                  className="pt-input mono"
                  style={{ fontSize: 11, width: '100%' }}
                  value={paymentAddress}
                  onChange={e => setPaymentAddress(e.target.value)}
                  placeholder="Receiving address"
                />
              )
            ) : (
              order.payment_address && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    className="pt-input mono"
                    style={{ fontSize: 11, flex: 1 }}
                    value={order.payment_address}
                    readOnly
                  />
                  <span style={{ fontSize: 10.5, color: 'var(--pt-fg-4)' }}>Sent to customer — cannot change</span>
                </div>
              )
            )}
          </>
        ) : (
          <LockedNotice reason={`Locked — order is ${order.status}. Payment cannot be changed after packing.`} />
        )}
      </div>

      {/* Shipping address */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Shipping address <span style={{ color: 'var(--pt-fg-4)', fontWeight: 400 }}>(optional)</span></div>
        {canEditShipping ? (
          <>
            <div className="pt-cat-form-grid">
              <input className="pt-input" placeholder="Street address" value={shippingAddress.ln1} onChange={e => setShippingAddress(a => ({ ...a, ln1: e.target.value }))} />
              <input className="pt-input" placeholder="Apt / unit" value={shippingAddress.ln2} onChange={e => setShippingAddress(a => ({ ...a, ln2: e.target.value }))} />
              <input className="pt-input" placeholder="City" value={shippingAddress.city} onChange={e => setShippingAddress(a => ({ ...a, city: e.target.value }))} />
              <input className="pt-input" placeholder="State" value={shippingAddress.state} onChange={e => setShippingAddress(a => ({ ...a, state: e.target.value }))} />
            </div>
            <input className="pt-input" style={{ marginTop: 8, width: 120 }} placeholder="ZIP" value={shippingAddress.zip} onChange={e => setShippingAddress(a => ({ ...a, zip: e.target.value }))} />
          </>
        ) : (
          <LockedNotice reason="Locked — order has been shipped. Shipping address cannot be changed." />
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--pt-danger)', marginTop: 4 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="pt-btn pt-btn-ghost" onClick={onCancel} disabled={isPending}>Cancel</button>
        <button className="pt-btn pt-btn-primary" onClick={submit} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>

    </div>
  )
}
