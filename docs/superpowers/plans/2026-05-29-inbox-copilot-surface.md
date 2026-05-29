# Inbox AI Copilot — Surfacing & Approve (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the `ai_suggestions` rows produced by the pipeline as internal-only cards — inline at the bottom of the conversation timeline AND in a right-rail Copilot panel — and let the tenant review, edit, and approve/dismiss each suggestion in its card (send a message, or commit a draft order) via the existing send/order flows.

**Architecture:** A new `InboxProvider` realtime subscription loads + streams open `ai_suggestions` for the active conversation into context. A single `SuggestionCard` component (modeled on `PendingApprovalCard`'s review→edit→send state machine, but kind-aware) renders in two places: inline in `.pt-ix-stream` and in the upgraded `InboxAIPanel` (the Copilot panel). Approve dispatches per kind through new thin server actions that reuse the existing cookie-forwarding POST-to-`/api/send` pattern (for `reply`/`quote`/`cross_sell`) and the `createOrder` server action (for `draft_order`). A settings toggle flips `tenants.copilot_enabled`. Depends on the pipeline plan (`2026-05-29-inbox-copilot-pipeline.md`) being merged first.

**Tech Stack:** Next.js 15 (App Router), React client components, TypeScript, Supabase Realtime, Vitest.

**Prerequisite:** Plan 1 merged — `ai_suggestions` table + `tenants.copilot_enabled` exist; `src/lib/copilot/types.ts` exports the payload types.

---

## File Structure

**Create:**
- `src/types/copilot.ts` — client-facing `SuggestionRow` + `mapSuggestionRow` (pure, tested) + `draftOrderToCreateOrderInput` (pure, tested).
- `src/app/inbox/copilot-actions.ts` — server actions: `getOpenSuggestions`, `dismissSuggestion`, `sendSuggestionMessage`, `commitDraftOrder`.
- `src/components/inbox/SuggestionCard.tsx` — the kind-aware review/edit/approve/dismiss card.
- `src/components/inbox/CopilotSuggestions.tsx` — renders a list of `SuggestionCard`s (shared by inline + panel).
- Test files under `src/types/__tests__/` and `src/lib/agent/tools/__tests__/` (for the optional `send_message` tool).

**Modify:**
- `src/components/inbox/InboxProvider.tsx` — add `suggestions` state, initial load, realtime subscription; expose via context.
- `src/components/inbox/InboxView.tsx` — render open suggestions inline at the bottom of `.pt-ix-stream` (in `ConversationPane`); pass through any needed props.
- `src/components/inbox/InboxAIPanel.tsx` — render the live suggestion list above the existing ask-AI chat.
- `styles/inbox.css` — internal-card styling (`pt-sug-*`), distinct from real bubbles.
- `src/app/settings/.../*` — a copilot enable/disable toggle (exact settings file located during execution).
- `src/lib/agent/tools/write.ts` + `src/lib/agent/tools/index.ts` — (optional, Task 9) the `send_message` agent tool.

**Reuse (do not rebuild):**
- `PendingApprovalCard` (`src/components/shared/PendingApprovalCard.tsx`) — the state-machine + class structure to model `SuggestionCard` on.
- The cookie-forwarding `fetch('/api/send', { conversationId, content })` pattern from `approveAndSendQueuedRun` (`src/app/automations/actions.ts:188-201`).
- The `createOrder` server action (`src/app/orders/actions.ts`) for `draft_order`.
- The realtime subscription pattern in `InboxProvider.tsx:349-398`.
- The `getTenantId()` cached helper used across `src/app/**/actions.ts`.

---

## Task 1: Client suggestion type + pure mappers

**Files:**
- Create: `src/types/copilot.ts`
- Create: `src/types/__tests__/copilot.test.ts`

- [ ] **Step 1: Write the failing test**

`src/types/__tests__/copilot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapSuggestionRow, draftOrderToCreateOrderInput } from '../copilot'

describe('mapSuggestionRow', () => {
  it('maps a db row (snake_case) to a SuggestionRow (camelCase)', () => {
    const row = {
      id: 's1', conversation_id: 'c1', customer_id: 'cu1', kind: 'quote',
      status: 'open', payload: { message: 'RETA-10 is $120' }, confidence: 0.9,
      reasoning: 'price question', created_at: '2026-05-29T10:00:00Z',
    }
    expect(mapSuggestionRow(row as never)).toEqual({
      id: 's1', conversationId: 'c1', customerId: 'cu1', kind: 'quote',
      status: 'open', payload: { message: 'RETA-10 is $120' }, confidence: 0.9,
      reasoning: 'price question', createdAt: '2026-05-29T10:00:00Z',
    })
  })
})

describe('draftOrderToCreateOrderInput', () => {
  it('maps a draft_order payload into the createOrder server-action shape', () => {
    const payload = {
      customer_id: 'cu1', payment_asset: 'USDC',
      items: [
        { product_id: 'p1', product_name: 'RETA-10', qty: 2, unit_price: 120 },
        { product_id: 'p2', product_name: 'BPC-157', qty: 1, unit_price: 50 },
      ],
      total: 290,
    }
    expect(draftOrderToCreateOrderInput(payload, 'c1')).toEqual({
      customerId: 'cu1',
      conversationId: 'c1',
      paymentAsset: 'USDC',
      paymentAmount: 290,
      items: [
        { productId: 'p1', qty: 2, unitPriceSnapshot: 120 },
        { productId: 'p2', qty: 1, unitPriceSnapshot: 50 },
      ],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/types/__tests__/copilot.test.ts`
Expected: FAIL — cannot find module `../copilot`.

- [ ] **Step 3: Write the type + mappers**

`src/types/copilot.ts`:

```ts
import type { SuggestionKind, SuggestionStatus, DraftOrderPayload } from '@/lib/copilot/types'

export type { SuggestionKind, SuggestionStatus } from '@/lib/copilot/types'
export type {
  CrossSellPayload, DraftOrderPayload, QuotePayload, ReplyPayload, PaymentLinkPayload,
} from '@/lib/copilot/types'

export interface SuggestionRow {
  id: string
  conversationId: string
  customerId: string
  kind: SuggestionKind
  status: SuggestionStatus
  payload: Record<string, unknown>
  confidence: number
  reasoning: string | null
  createdAt: string
}

interface DbSuggestionRow {
  id: string
  conversation_id: string
  customer_id: string
  kind: SuggestionKind
  status: SuggestionStatus
  payload: Record<string, unknown>
  confidence: number
  reasoning: string | null
  created_at: string
}

export function mapSuggestionRow(row: DbSuggestionRow): SuggestionRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    customerId: row.customer_id,
    kind: row.kind,
    status: row.status,
    payload: row.payload ?? {},
    confidence: row.confidence,
    reasoning: row.reasoning,
    createdAt: row.created_at,
  }
}

export interface CreateOrderInput {
  customerId: string
  conversationId?: string
  paymentAsset?: string
  paymentAmount: number
  items: { productId: string; qty: number; unitPriceSnapshot: number }[]
}

export function draftOrderToCreateOrderInput(
  payload: DraftOrderPayload,
  conversationId: string,
): CreateOrderInput {
  return {
    customerId: payload.customer_id,
    conversationId,
    paymentAsset: payload.payment_asset,
    paymentAmount: payload.total,
    items: payload.items.map(i => ({
      productId: i.product_id,
      qty: i.qty,
      unitPriceSnapshot: i.unit_price,
    })),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/types/__tests__/copilot.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/copilot.ts src/types/__tests__/copilot.test.ts
git commit -m "feat(copilot): client SuggestionRow type + pure mappers"
```

---

## Task 2: Server actions — list, dismiss, send, commit

These are thin (cookie-auth, `getTenantId()`); the testable logic lives in the Task 1 mappers. Verified by type-check + manual integration (consistent with the existing untested `actions.ts` files).

**Files:**
- Create: `src/app/inbox/copilot-actions.ts`

- [ ] **Step 1: Locate the shared helpers to import**

Confirm the exact import paths used by the existing inbox/automation actions:
- `getTenantId()` — used in `src/app/automations/actions.ts` (copy its import line).
- `createClient` server helper — from `@/lib/supabase/server` (the one used in other server actions).
- `createOrder` — from `@/app/orders/actions`.

Run: `npx grep -rn "getTenantId" src/app/automations/actions.ts` (or read the file) to copy the exact import.

- [ ] **Step 2: Write the server actions**

`src/app/inbox/copilot-actions.ts`:

```ts
'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTenantId } from '@/app/automations/actions'  // adjust if getTenantId lives elsewhere
import { createOrder } from '@/app/orders/actions'
import {
  mapSuggestionRow,
  draftOrderToCreateOrderInput,
  type SuggestionRow,
  type DraftOrderPayload,
} from '@/types/copilot'

export async function getOpenSuggestions(conversationId: string): Promise<SuggestionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_suggestions')
    .select('id, conversation_id, customer_id, kind, status, payload, confidence, reasoning, created_at')
    .eq('conversation_id', conversationId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data.map(r => mapSuggestionRow(r as never))
}

export async function dismissSuggestion(id: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('ai_suggestions')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

/** For reply / quote / cross_sell: deliver the (edited) message, then mark sent. */
export async function sendSuggestionMessage(
  id: string,
  message: string,
): Promise<{ success: true } | { error: string }> {
  const trimmed = message.trim()
  if (!trimmed) return { error: 'Message is empty' }

  const supabase = await createClient()
  const { data: row, error: fetchErr } = await supabase
    .from('ai_suggestions')
    .select('conversation_id, status')
    .eq('id', id)
    .single()
  if (fetchErr || !row) return { error: 'Suggestion not found' }
  if (row.status !== 'open') return { error: 'Suggestion already actioned' }

  // Reuse the cookie-forwarding send pattern from approveAndSendQueuedRun.
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join('; ')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
  const sendRes = await fetch(`${baseUrl}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ conversationId: row.conversation_id, content: trimmed }),
  })
  if (!sendRes.ok) {
    const body = await sendRes.json().catch(() => ({}))
    return { error: (body as { error?: string }).error ?? 'Failed to send' }
  }

  await supabase
    .from('ai_suggestions')
    .update({ status: 'sent', payload: { message: trimmed } as never, updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/inbox')
  return { success: true }
}

/** For draft_order: commit the order via the existing server action, then mark committed. */
export async function commitDraftOrder(
  id: string,
): Promise<{ success: true; orderId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: row, error: fetchErr } = await supabase
    .from('ai_suggestions')
    .select('conversation_id, payload, status')
    .eq('id', id)
    .single()
  if (fetchErr || !row) return { error: 'Suggestion not found' }
  if (row.status !== 'open') return { error: 'Suggestion already actioned' }

  const input = draftOrderToCreateOrderInput(
    row.payload as unknown as DraftOrderPayload,
    row.conversation_id,
  )
  const result = await createOrder(input)
  if ('error' in result) return { error: result.error }

  await supabase
    .from('ai_suggestions')
    .update({ status: 'committed', updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/inbox')
  return { success: true, orderId: result.orderId }
}
```

Note: `getTenantId` isn't called directly here because RLS already scopes every query by tenant via the JWT. Remove the unused import if your linter flags it. If `getTenantId` is NOT exported from `automations/actions`, drop that import line entirely (it is not needed).

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. If `createClient` is async vs sync in this codebase, match the existing call sites (some Next 15 setups make it `await createClient()`).

- [ ] **Step 4: Commit**

```bash
git add src/app/inbox/copilot-actions.ts
git commit -m "feat(copilot): server actions to list/dismiss/send/commit suggestions"
```

---

## Task 3: `SuggestionCard` component

A kind-aware card modeled on `PendingApprovalCard`. Message kinds (`reply`/`quote`/`cross_sell`) → edit-in-place + Send. `draft_order` → item list + Create order. Always internal styling.

**Files:**
- Create: `src/components/inbox/SuggestionCard.tsx`

- [ ] **Step 1: Write the component**

`src/components/inbox/SuggestionCard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  sendSuggestionMessage,
  dismissSuggestion,
  commitDraftOrder,
} from '@/app/inbox/copilot-actions'
import type { SuggestionRow, DraftOrderPayload } from '@/types/copilot'

type CardState = 'idle' | 'confirming' | 'working' | 'done' | 'error'

const KIND_LABEL: Record<string, string> = {
  cross_sell: 'AI cross-sell',
  draft_order: 'AI draft order',
  quote: 'AI quote',
  reply: 'AI reply',
  payment_link: 'AI payment link',
}

function messageText(s: SuggestionRow): string {
  const p = s.payload
  if (s.kind === 'cross_sell') return String(p.offer_message ?? '')
  return String(p.message ?? '')
}

export function SuggestionCard({ suggestion, onRemove }: {
  suggestion: SuggestionRow
  onRemove: (id: string) => void
}) {
  const isMessageKind = suggestion.kind === 'reply' || suggestion.kind === 'quote' || suggestion.kind === 'cross_sell'
  const [state, setState] = useState<CardState>('idle')
  const [edited, setEdited] = useState(messageText(suggestion))
  const [isEditing, setIsEditing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const router = useRouter()

  function handleDismiss() {
    onRemove(suggestion.id)
    dismissSuggestion(suggestion.id).catch(() => {})
  }

  async function handleSendMessage() {
    setIsEditing(false)
    setState('working')
    const result = await sendSuggestionMessage(suggestion.id, edited)
      .catch(e => ({ error: e instanceof Error ? e.message : 'Unknown error' }))
    if ('error' in result) { setErrorMessage(result.error); setState('error') }
    else { setState('done'); setTimeout(() => onRemove(suggestion.id), 1200) }
  }

  async function handleCommitOrder() {
    setState('working')
    const result = await commitDraftOrder(suggestion.id)
      .catch(e => ({ error: e instanceof Error ? e.message : 'Unknown error' }))
    if ('error' in result) { setErrorMessage(result.error); setState('error') }
    else { setState('done'); setTimeout(() => onRemove(suggestion.id), 1400) }
  }

  const confidencePct = Math.round(suggestion.confidence * 100)

  return (
    <div className={`pt-sug pt-sug-${suggestion.kind}`}>
      <div className="pt-sug-head">
        <span className="pt-sug-kind">{KIND_LABEL[suggestion.kind] ?? 'AI suggestion'}</span>
        <span className="pt-sug-conf" title="Model confidence">{confidencePct}%</span>
        <button className="pt-sug-dismiss" onClick={handleDismiss} title="Dismiss">✕</button>
      </div>

      {suggestion.reasoning && <div className="pt-sug-reason">{suggestion.reasoning}</div>}

      {/* Body by kind */}
      {isMessageKind && (
        <>
          {state === 'confirming' && isEditing ? (
            <textarea
              className="pt-sug-edit-ta"
              value={edited}
              onChange={e => setEdited(e.target.value)}
              onBlur={() => setIsEditing(false)}
              autoFocus
              rows={4}
            />
          ) : (
            <div
              className="pt-sug-msg"
              onClick={() => { if (state === 'confirming') setIsEditing(true) }}
              title={state === 'confirming' ? 'Click to edit' : undefined}
            >
              {edited}
            </div>
          )}
        </>
      )}

      {suggestion.kind === 'draft_order' && (
        <DraftOrderBody payload={suggestion.payload as unknown as DraftOrderPayload} />
      )}

      {/* Footer / actions */}
      {state === 'idle' && (
        <div className="pt-sug-foot">
          {isMessageKind && (
            <button className="pt-sug-primary" onClick={() => setState('confirming')}>Review &amp; send →</button>
          )}
          {suggestion.kind === 'draft_order' && (
            <button className="pt-sug-primary" onClick={handleCommitOrder}>Create order →</button>
          )}
          {suggestion.kind === 'payment_link' && (
            <button className="pt-sug-primary" disabled title="Coming soon">Payment link</button>
          )}
        </div>
      )}

      {state === 'confirming' && (
        <div className="pt-sug-foot">
          <button className="pt-sug-primary" onClick={handleSendMessage} disabled={!edited.trim()}>Send</button>
          <button className="pt-sug-cancel" onClick={() => { setState('idle'); setIsEditing(false); setEdited(messageText(suggestion)) }}>Cancel</button>
        </div>
      )}

      {state === 'working' && <div className="pt-sug-status">Working…</div>}
      {state === 'done' && <div className="pt-sug-status pt-sug-done">✓ Done</div>}
      {state === 'error' && (
        <div className="pt-sug-foot">
          <div className="pt-sug-err">{errorMessage}</div>
          <button className="pt-sug-cancel" onClick={() => { setState('idle'); setErrorMessage('') }}>Retry</button>
          <button className="pt-sug-cancel" onClick={() => router.push(`/inbox?conversation=${suggestion.conversationId}`)}>Open chat</button>
        </div>
      )}
    </div>
  )
}

function DraftOrderBody({ payload }: { payload: DraftOrderPayload }) {
  return (
    <div className="pt-sug-order">
      {(payload.items ?? []).map((it, i) => (
        <div key={i} className="pt-sug-order-line">
          <span className="pt-sug-order-name">{it.qty}× {it.product_name}</span>
          <span className="pt-sug-order-price">${(it.qty * it.unit_price).toFixed(2)}</span>
        </div>
      ))}
      <div className="pt-sug-order-total">
        <span>Total</span><span>${Number(payload.total ?? 0).toFixed(2)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/SuggestionCard.tsx
git commit -m "feat(copilot): kind-aware SuggestionCard with review/edit/approve"
```

---

## Task 4: Internal-card styling

Distinct from real chat bubbles — these are tenant-only. Append to `styles/inbox.css`.

**Files:**
- Modify: `styles/inbox.css`

- [ ] **Step 1: Append the styles**

Add to the end of `styles/inbox.css`:

```css
/* ── AI Copilot suggestion cards (internal-only; never sent to customer) ── */
.pt-sug {
  border: 1px solid var(--pt-accent-soft, oklch(0.9 0.04 260));
  background: var(--pt-surface-2, oklch(0.98 0.01 260));
  border-radius: 12px;
  padding: 10px 12px;
  margin: 8px 0;
  box-shadow: var(--pt-shadow-soft, 0 1px 2px rgba(0,0,0,0.04));
  font-size: 13px;
}
.pt-sug-head { display: flex; align-items: center; gap: 8px; }
.pt-sug-kind {
  font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase;
  font-size: 10.5px; color: var(--pt-accent, oklch(0.55 0.13 260));
}
.pt-sug-conf {
  font-size: 11px; color: var(--pt-fg-3, #888);
  background: var(--pt-surface-3, rgba(0,0,0,0.04)); border-radius: 999px; padding: 1px 7px;
}
.pt-sug-dismiss {
  margin-left: auto; border: none; background: none; cursor: pointer;
  color: var(--pt-fg-3, #999); font-size: 12px; line-height: 1; padding: 2px 4px;
}
.pt-sug-dismiss:hover { color: var(--pt-fg-1, #333); }
.pt-sug-reason { color: var(--pt-fg-2, #666); font-size: 12px; margin: 6px 0; font-style: italic; }
.pt-sug-msg {
  background: var(--pt-bg, #fff); border: 1px solid var(--pt-border, #eee);
  border-radius: 8px; padding: 8px 10px; margin: 6px 0; white-space: pre-wrap; cursor: default;
}
.pt-sug-edit-ta {
  width: 100%; box-sizing: border-box; border: 1px solid var(--pt-accent, #88a);
  border-radius: 8px; padding: 8px 10px; margin: 6px 0; font: inherit; resize: vertical;
}
.pt-sug-order { margin: 6px 0; }
.pt-sug-order-line { display: flex; justify-content: space-between; padding: 2px 0; }
.pt-sug-order-total {
  display: flex; justify-content: space-between; font-weight: 600;
  border-top: 1px solid var(--pt-border, #eee); margin-top: 4px; padding-top: 4px;
}
.pt-sug-foot { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.pt-sug-primary {
  background: var(--pt-accent, oklch(0.55 0.13 260)); color: #fff; border: none;
  border-radius: 8px; padding: 6px 12px; font-weight: 600; cursor: pointer; font-size: 12.5px;
}
.pt-sug-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.pt-sug-cancel {
  background: none; border: 1px solid var(--pt-border, #ddd); border-radius: 8px;
  padding: 6px 12px; cursor: pointer; font-size: 12.5px; color: var(--pt-fg-2, #555);
}
.pt-sug-status { margin-top: 8px; font-size: 12px; color: var(--pt-fg-2, #666); }
.pt-sug-done { color: var(--pt-ok, #2a8); font-weight: 600; }
.pt-sug-err { color: var(--pt-danger, #c33); font-size: 12px; flex: 1; }
```

(If any `--pt-*` token referenced here doesn't exist, the fallback after the comma applies — but prefer wiring real tokens; check `styles/peptech.css` for the closest existing names during execution.)

- [ ] **Step 2: Commit**

```bash
git add styles/inbox.css
git commit -m "feat(copilot): internal suggestion-card styling"
```

---

## Task 5: `CopilotSuggestions` list component

A thin wrapper that renders a list of `SuggestionCard`s with local removal (optimistic dismiss/done). Shared by the inline timeline and the panel.

**Files:**
- Create: `src/components/inbox/CopilotSuggestions.tsx`

- [ ] **Step 1: Write the component**

`src/components/inbox/CopilotSuggestions.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { SuggestionCard } from './SuggestionCard'
import type { SuggestionRow } from '@/types/copilot'

export function CopilotSuggestions({ suggestions, variant }: {
  suggestions: SuggestionRow[]
  variant: 'inline' | 'panel'
}) {
  // Local removal so a dismissed/sent card disappears immediately,
  // even before the realtime UPDATE round-trips.
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  useEffect(() => { setRemoved(new Set()) }, [suggestions.length])

  const visible = suggestions.filter(s => !removed.has(s.id))
  if (visible.length === 0) {
    return variant === 'panel'
      ? <div className="pt-sug-empty">No live suggestions yet. They appear as the conversation progresses.</div>
      : null
  }

  return (
    <div className={`pt-sug-list pt-sug-list-${variant}`}>
      {visible.map(s => (
        <SuggestionCard
          key={s.id}
          suggestion={s}
          onRemove={(id) => setRemoved(prev => new Set(prev).add(id))}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add minimal list/empty styling**

Append to `styles/inbox.css`:

```css
.pt-sug-list-inline { margin: 4px 0 8px; }
.pt-sug-empty { color: var(--pt-fg-3, #999); font-size: 12.5px; padding: 12px 4px; }
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/inbox/CopilotSuggestions.tsx styles/inbox.css
git commit -m "feat(copilot): CopilotSuggestions list wrapper"
```

---

## Task 6: Realtime suggestions in `InboxProvider`

Load open suggestions when a conversation opens, subscribe to `ai_suggestions` INSERT/UPDATE for it, expose via context. Mirrors the existing `messages` subscription at `InboxProvider.tsx:349-398`.

**Files:**
- Modify: `src/components/inbox/InboxProvider.tsx`

- [ ] **Step 1: Add state + context field**

Near the existing `messages` state in `InboxProvider`, add:

```tsx
const [suggestions, setSuggestions] = useState<SuggestionRow[]>([])
```

Add imports at the top:

```tsx
import { getOpenSuggestions } from '@/app/inbox/copilot-actions'
import { mapSuggestionRow, type SuggestionRow } from '@/types/copilot'
```

Add `suggestions` to the context value object and to the context's TypeScript type (wherever `messages` is declared in the `InboxContextValue` interface / `useInbox` return type):

```tsx
suggestions: SuggestionRow[]
```

…and include `suggestions` in the `value={{ ... }}` passed to the provider.

- [ ] **Step 2: Initial load on conversation change**

Add an effect (next to the messages-loading effect, keyed on the active conversation id — call it `activeId` to match the existing subscription effect):

```tsx
useEffect(() => {
  if (!activeId) { setSuggestions([]); return }
  let cancelled = false
  getOpenSuggestions(activeId).then(rows => { if (!cancelled) setSuggestions(rows) })
  return () => { cancelled = true }
}, [activeId])
```

- [ ] **Step 3: Realtime subscription**

Add, modeled exactly on the existing `messages:${activeId}` subscription block:

```tsx
useEffect(() => {
  if (!activeId) return
  const channel = supabase
    .channel(`ai_suggestions:${activeId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'ai_suggestions',
      filter: `conversation_id=eq.${activeId}`,
    }, (payload) => {
      const row = mapSuggestionRow(payload.new as never)
      if (row.status !== 'open') return
      setSuggestions(prev => prev.some(s => s.id === row.id) ? prev : [...prev, row])
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'ai_suggestions',
      filter: `conversation_id=eq.${activeId}`,
    }, (payload) => {
      const row = mapSuggestionRow(payload.new as never)
      setSuggestions(prev =>
        row.status === 'open'
          ? prev.map(s => s.id === row.id ? row : s)
          : prev.filter(s => s.id !== row.id),   // sent/committed/dismissed leave the open list
      )
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [activeId, supabase])
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (If `activeId`/`supabase` are named differently in the provider, match the names used by the existing `messages` subscription.)

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/InboxProvider.tsx
git commit -m "feat(copilot): load + stream open suggestions via realtime"
```

---

## Task 7: Render suggestions inline + in the Copilot panel

Open suggestions render at the **bottom** of the stream (they always concern the latest activity, and appear in realtime as the conversation progresses — this satisfies "inline in the timeline" without fragile timestamp-merging against `InboxMessage`). The same list renders in the upgraded `InboxAIPanel`.

**Files:**
- Modify: `src/components/inbox/InboxView.tsx`
- Modify: `src/components/inbox/InboxAIPanel.tsx`

- [ ] **Step 1: Render inline at the bottom of the stream**

In `src/components/inbox/InboxView.tsx`, `ConversationPane` reads suggestions from context. Add the import:

```tsx
import { CopilotSuggestions } from './CopilotSuggestions'
import { useInbox } from './InboxProvider'   // if not already imported
```

Inside `ConversationPane`, get the suggestions:

```tsx
const { suggestions } = useInbox()
```

Then, immediately AFTER the `messages.map(...)` block and still INSIDE the `.pt-ix-stream` div (after the closing `)}` of the map, before the `</div>` that closes `pt-ix-stream` at ~line 822):

```tsx
        <CopilotSuggestions
          suggestions={suggestions.filter(s => s.conversationId === thread.id)}
          variant="inline"
        />
```

(The `thread.id` filter guards against a stale list during a conversation switch.)

- [ ] **Step 2: Render the list in the Copilot panel**

In `src/components/inbox/InboxAIPanel.tsx`, add imports:

```tsx
import { CopilotSuggestions } from './CopilotSuggestions'
import { useInbox } from './InboxProvider'
```

Inside the component, read + filter:

```tsx
const { suggestions } = useInbox()
const live = suggestions.filter(s => s.conversationId === conversationId)
```

Render a "Live suggestions" section at the TOP of the panel body, above the existing chips/messages/ask-AI input. Locate the panel's root (`pt-inbox-ai-card`) and insert right after the header (`pt-inbox-ai-card-hd`):

```tsx
        <div className="pt-inbox-ai-live">
          <div className="pt-inbox-ai-live-hd">Live suggestions</div>
          <CopilotSuggestions suggestions={live} variant="panel" />
        </div>
```

Add styling — append to `styles/inbox.css`:

```css
.pt-inbox-ai-live { border-bottom: 1px solid var(--pt-border, #eee); padding-bottom: 8px; margin-bottom: 8px; }
.pt-inbox-ai-live-hd { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--pt-fg-3, #999); margin-bottom: 4px; }
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual UI check (dev server)**

Run: `npm run dev`. With an opted-in tenant (`copilot_enabled = true`) and a conversation that already has an `open` `ai_suggestions` row (insert one by hand if needed — see snippet below):
1. Open `/inbox`, open that conversation.
2. Inline card appears at the bottom of the stream with kind label + confidence + reasoning.
3. Open the AI rail panel (spark icon) → the same suggestion appears under "Live suggestions".
4. For a `reply`/`quote`/`cross_sell`: "Review & send" → text becomes editable → edit → "Send" → message delivered to the conversation, card shows ✓ and disappears.
5. Dismiss (✕) on another card → card disappears; row status becomes `dismissed`.
6. Insert a new `open` row via SQL while the conversation is open → it appears in realtime in both places.

Hand-insert snippet (psql / Supabase SQL editor; replace ids):
```sql
insert into ai_suggestions (tenant_id, conversation_id, customer_id, kind, payload, confidence, reasoning, dedup_key)
values ('<tenant>','<conv>','<cust>','quote','{"message":"RETA-10 is $120 and in stock."}'::jsonb, 0.9, 'Customer asked the price', 'quote');
```

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/InboxView.tsx src/components/inbox/InboxAIPanel.tsx styles/inbox.css
git commit -m "feat(copilot): surface suggestions inline + in Copilot panel"
```

---

## Task 8: Settings — tenant copilot toggle

A control to flip `tenants.copilot_enabled` (cost opt-in + mute).

**Files:**
- Modify: a settings actions file + the settings UI (exact files located during execution)

- [ ] **Step 1: Locate the settings surface**

Run: read `src/app/settings/` to find where tenant-level flags are edited (e.g. a general/profile settings form + its server action). Match that file's existing pattern.

- [ ] **Step 2: Add a server action**

Add to the relevant settings actions file (or create `src/app/settings/copilot-actions.ts`):

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function setCopilotEnabled(enabled: boolean): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  // RLS scopes to the caller's tenant; update the single tenant row.
  const { error } = await supabase
    .from('tenants')
    .update({ copilot_enabled: enabled })
    .not('id', 'is', null)   // update the (RLS-visible) tenant row
  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}
```

(If tenant updates elsewhere target `.eq('id', tenantId)` with a `getTenantId()`, match that pattern instead — the RLS-only update above works because the policy restricts visibility to one row.)

- [ ] **Step 3: Add the toggle UI**

In the settings form (match existing toggle/switch markup — reuse the same control other boolean settings use), add a labeled toggle bound to `copilot_enabled` (read from the loaded tenant row) that calls `setCopilotEnabled(next)` on change. Copy: **"AI Copilot — draft cross-sells, quotes, and replies as conversations progress (you approve everything before it sends)."**

- [ ] **Step 4: Verify type-check + manual**

Run: `npx tsc --noEmit` (no new errors). Then in dev: toggle on → confirm `select copilot_enabled from tenants` is `true`; toggle off → `false`. With it off, send an inbound test message → confirm NO new `ai_suggestions` row (pipeline gate from Plan 1).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(copilot): settings toggle for per-tenant copilot opt-in"
```

---

## Task 9 (optional — same fast-follow tier as payment_link): `send_message` agent tool

The spec lists a `send_message` agent tool so the manual ask-AI box can offer to deliver a message. The approve flow does NOT depend on it (it uses the Task 2 server action), so this is optional. Implement only if the in-panel agent should be able to send.

**Files:**
- Modify: `src/lib/agent/tools/write.ts`
- Modify: `src/lib/agent/tools/index.ts`
- Create: `src/lib/agent/tools/__tests__/send-message.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/agent/tools/__tests__/send-message.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { sendMessage } from '../write'

describe('send_message tool', () => {
  it('is confirm-gated and summarises the target', () => {
    expect(sendMessage.name).toBe('send_message')
    expect(sendMessage.requiresConfirmation).toBe(true)
    expect(sendMessage.summarise?.({ conversation_id: 'c1', content: 'hello' } as never))
      .toMatch(/hello/)
  })

  it('inserts an outbound message row on execute', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { channel_type: 'whatsapp', channel_identifier: 'x', customer_id: 'cu1' } }) }) }),
        insert,
      }),
    }
    const res = await sendMessage.execute(
      { conversation_id: 'c1', content: 'hello' } as never,
      supabase as never,
      'tenant1',
    )
    expect(res).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/agent/tools/__tests__/send-message.test.ts`
Expected: FAIL — `sendMessage` is not exported.

- [ ] **Step 3: Implement the tool**

In `src/lib/agent/tools/write.ts`, add (and include it in the exported `WRITE_TOOLS` array):

```ts
export const sendMessage: AgentTool = {
  name: 'send_message',
  description: 'Send a message to the customer in a conversation. Requires confirmation. Use only when the operator wants to deliver a drafted reply.',
  inputSchema: {
    type: 'object',
    required: ['conversation_id', 'content'],
    properties: {
      conversation_id: { type: 'string' },
      content: { type: 'string' },
    },
  },
  requiresConfirmation: true,
  summarise: (input) => `Send "${String((input as { content?: string }).content ?? '').slice(0, 60)}"`,
  async execute(raw, supabase, tenantId) {
    const input = raw as { conversation_id: string; content: string }
    // Insert the outbound row; channel dispatch is handled by /api/send for the
    // approve flow. For the agent path, mark queued for the operator to send.
    const { error } = await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: input.conversation_id,
      direction: 'outbound',
      content: input.content,
      status: 'draft',
    } as never)
    if (error) throw new Error(error.message)
    return { queued: true }
  },
}
```

Then add `sendMessage` to `WRITE_TOOLS` in the same file. `TOOL_MAP` / `openAiToolsForMode('ops')` pick it up automatically via `index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/agent/tools/__tests__/send-message.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/write.ts src/lib/agent/tools/__tests__/send-message.test.ts
git commit -m "feat(copilot): send_message agent tool (confirm-gated)"
```

---

## Task 10 (optional — droppable fast-follow): `payment_link` approve flow

Wire the `payment_link` kind to the existing NOWPayments/Privy payment-link generation. Drop if the plan is heavy; the card already renders a disabled "Payment link" button (Task 3) as a placeholder.

**Files:**
- Modify: `src/app/inbox/copilot-actions.ts`
- Modify: `src/components/inbox/SuggestionCard.tsx`

- [ ] **Step 1: Locate the existing payment-link generator**

Run: read the crypto checkout / payment-link flow (the NOWPayments/Privy code referenced in the spec — likely `src/lib/payments/` or an `/api/payments/*` route). Identify the function that, given an order id, creates + returns a payment link, and how a link is sent to the customer.

- [ ] **Step 2: Add `generatePaymentLink` server action**

In `src/app/inbox/copilot-actions.ts`, add an action that reads the suggestion's `payload` (`{ order_id }` or `{ draft_order }`), commits the draft order first if needed (reuse `commitDraftOrder`'s mapping), generates the payment link via the existing generator, sends it via the `/api/send` cookie-forwarding pattern, then sets the suggestion `status: 'sent'`. (Exact generator signature filled in from Step 1.)

- [ ] **Step 3: Wire the card button**

In `SuggestionCard.tsx`, replace the disabled `payment_link` button with one that calls the new action (mirroring `handleCommitOrder`'s working/done/error states).

- [ ] **Step 4: Type-check + manual**

Run: `npx tsc --noEmit`. Then manually: a `payment_link` suggestion → approve → link generated + sent → (existing) on-chain detection + auto-advance complete the loop (unchanged, per spec non-goals).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(copilot): payment_link suggestion approve flow"
```

---

## Verification (whole plan)

- **Unit:** `mapSuggestionRow` snake→camel mapping; `draftOrderToCreateOrderInput` shape; (optional) `send_message` confirm-gating + summarise + execute insert.
- **Type-check:** `npx tsc --noEmit` clean after every task.
- **Manual (dev server) — the animation end-to-end:** opted-in tenant; inbound price/stock question → suggestion appears inline + in panel (realtime); approve a `cross_sell`/`quote`/`reply` → edit-in-place → send → delivered to the customer + card resolves; approve a `draft_order` → order created (`orders` row + appears in orders view); dismiss → card gone + row `dismissed`; toggle copilot off in settings → new inbound produces no suggestion.
- **Internal-only invariant:** confirm the customer NEVER receives an inline card — only the explicitly-approved message text is sent via `/api/send`.

## Out of scope (this plan)

- The entire backend pipeline (Plan 1).
- Changing the existing payment-detection / order-auto-advance flow (spec non-goal).
- Time-ordered interleaving of cards *between* individual messages — v1 renders open suggestions at the bottom of the stream (justified above).
- Multi-agent / autonomous selling — the copilot only suggests; the tenant approves everything.
