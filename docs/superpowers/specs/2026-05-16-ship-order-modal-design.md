# Ship Order Modal — Design Spec

## Goal

Replace the inline shipping form that appears in the order detail page header with a centred modal overlay, consistent with the existing Send Invoice modal pattern.

## Background

When a seller clicks "Mark as Shipped" on an order in `packing` status, a form currently expands inline inside the header action area — unstyled and visually out of place. The form collects carrier, tracking number, tracking URL, and estimated delivery before calling the `shipOrder()` server action.

The project already has a working modal pattern (`pt-modal-backdrop`, `pt-modal`, `pt-modal-hd`, `pt-modal-body`, `pt-modal-ft`) used by `SendInvoiceModal`. This spec moves the shipping form into that same pattern.

## Architecture

One new component, minimal change to the parent.

- **New:** `src/components/orders/ShipOrderModal.tsx` — self-contained modal, receives `orderId`, `refNumber`, and callbacks; owns all ship-form state internally.
- **Modified:** `src/components/orders/OrderDetailView.tsx` — replace `showShipForm` + 5 ship-state fields with a single `showShipModal` boolean; render `<ShipOrderModal>` alongside `<SendInvoiceModal>`; remove inline form JSX.

No changes to server actions, CSS variables, or types.

## ShipOrderModal Component

**Props:**
```typescript
interface ShipOrderModalProps {
  orderId: string
  refNumber: string
  onSuccess: () => void   // parent calls setStatus('shipped') + router.refresh()
  onClose: () => void
}
```

**Internal state:** `carrier`, `trackingNumber`, `trackingUrl`, `estimatedDelivery` (all strings), `error` (string | null), `pending` via `useTransition`.

**Structure:**
```
pt-modal-backdrop  (onClick → onClose, disabled when pending)
  pt-modal
    pt-modal-hd
      h3: "Mark as Shipped · #{refNumber}"
      pt-iconbtn ✕ (onClick → onClose, disabled when pending)
    pt-modal-body
      form rows using pt-ship-form-row / pt-ship-form-label / pt-input
        Carrier *        (required — validated on submit)
        Tracking number  (optional)
        Tracking URL     (optional)
        Est. delivery    (optional, type="date")
      error message (pt-danger colour) if error is set
    pt-modal-ft
      pt-btn (Cancel → onClose)
      pt-btn pt-btn-primary (Confirm shipment → submitShipping)
```

**Submit logic:** Validates carrier is non-empty, calls `shipOrder()`, on success calls `onSuccess()` then `onClose()`. On error sets `error` string in modal body.

## OrderDetailView Changes

- Remove: `showShipForm`, `shipCarrier`, `shipTracking`, `shipUrl`, `shipEta`, `shipError` state
- Remove: `submitShipping` function
- Remove: inline `pt-ship-form` JSX block (lines 204–241)
- Add: `showShipModal` boolean state (default `false`)
- Change: "Mark as Shipped" button `onClick` → `() => setShowShipModal(true)` (instead of toggling old inline form)
- Add: `<ShipOrderModal>` rendered conditionally next to `<SendInvoiceModal>`, with `onSuccess` that calls `setStatus('shipped')` + `router.refresh()`, and `onClose` that sets `showShipModal(false)`

## CSS

No new CSS needed. The modal uses existing `pt-modal-*` classes. The form rows reuse `pt-ship-form-row`, `pt-ship-form-label`, and `pt-input` which are already defined in `styles/peptech.css`.

## Testing

- `ShipOrderModal` renders with carrier field focused-ready
- Submit with empty carrier shows error, does not call `shipOrder`
- Submit with valid carrier calls `shipOrder`, on success calls `onSuccess` + `onClose`
- Backdrop click calls `onClose`
- ✕ button calls `onClose`
- Disabled state during `pending` (backdrop click and buttons)
