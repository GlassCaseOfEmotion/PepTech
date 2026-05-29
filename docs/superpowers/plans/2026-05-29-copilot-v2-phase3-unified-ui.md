# Copilot v2 — Phase 3: Unified Copilot Panel (Design-Led UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The panel component (Task 5) is built with the `frontend-design` skill — see its task for the aesthetic brief.**

**Goal:** Replace the inbox right-rail AI panel with a world-class agentic copilot conversational panel that renders the per-conversation copilot session live (commentary + tool actions + confirm cards + a live draft-order surface) and lets the operator command the agent — retiring the v1 suggestion cards.

**Architecture:** The panel is **driven by a realtime subscription to `agent_messages`** for the conversation's copilot session (commentary = assistant `content`; actions = `tool_calls`; gated calls = `tool_calls` with `status:'pending'` → confirm cards). The operator's composer POSTs an `[OPERATOR]`-tagged message to `/api/agent/chat` (with the copilot session id); confirm/reject buttons POST `/api/agent/confirm`. Both run turns server-side that persist to `agent_messages`, which the subscription reflects — so the panel needs no SSE parsing. A live draft-order surface reads the conversation's `'draft'` order via a server action and refetches when the timeline updates.

**Tech Stack:** Next.js 15, React, TypeScript, Supabase Realtime, the `frontend-design` skill, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-29-copilot-v2-agentic-design.md` (Phase 3 of 3). **Prereqs:** Phase 1 + 2 merged (copilot session, `runCopilotWatch`, draft-order tools).

**Design mandate (from user):** the current right-rail "AI assistant" (`InboxAIPanel`) is disliked — do NOT retrofit it. The new panel is a from-scratch, design-led, distinctive agentic surface (memory: `feedback_copilot_panel_design`).

---

## File Structure

**Create:**
- `supabase/migrations/20260529000006_realtime_agent_messages.sql` — publish `agent_messages` to `supabase_realtime` + `REPLICA IDENTITY FULL`.
- `src/app/inbox/copilot-panel-actions.ts` — server actions: `getCopilotSessionId(conversationId)`, `getCopilotTimeline(sessionId)`, `getConversationDraftOrder(conversationId)`.
- `src/components/inbox/copilot/CopilotPanel.tsx` — the design-led panel (composition root).
- `src/components/inbox/copilot/useCopilotSession.ts` — hook: load session + timeline + realtime subscription + draft order; expose `send`/`confirm` actions.
- Sub-components as the design calls for (e.g. `CopilotTimeline.tsx`, `CopilotConfirmCard.tsx`, `CopilotDraftOrder.tsx`, `CopilotComposer.tsx`) under `src/components/inbox/copilot/`.
- `styles/copilot.css` (or additions to `styles/inbox.css`) for the panel.
- Tests for the pure pieces (timeline mapping, server-action shape).

**Modify:**
- `src/components/inbox/RailPanelHost.tsx` — render `CopilotPanel` for `panel==='ai'` instead of `InboxAIPanel`.
- `src/components/inbox/RailStrip.tsx` — repoint the AI badge to the copilot pending-confirm/open count (or drop it); update label/icon if the design calls for it.
- `src/components/inbox/InboxView.tsx` — remove the inline `CopilotSuggestions` render.
- `src/components/inbox/InboxProvider.tsx` — remove v1 `suggestions` state/load/subscription/context.

**Reuse:** the `readSseStream`/confirm pattern + tool-call card markup from `src/components/agent/AgentView.tsx`; the realtime subscription template from `InboxProvider.tsx`; `readDraftOrder` from `src/lib/agent/copilot/draft-order.ts`; `getOrCreateCopilotSession` from `src/lib/agent/copilot/session.ts`; `formatAmount` from `src/lib/currency.ts`.

**Retire (delete after the new panel works):** `src/components/inbox/InboxAIPanel.tsx`, `CopilotSuggestions.tsx`, `SuggestionCard.tsx` — see Task 7.

---

## Task 1: Realtime-publish `agent_messages`

**Files:**
- Create: `supabase/migrations/20260529000006_realtime_agent_messages.sql`

- [ ] **Step 1: Write the migration** (guarded add + replica identity, mirroring `20260523000004`)

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
  END IF;
END $$;

ALTER TABLE public.agent_messages REPLICA IDENTITY FULL;
```

- [ ] **Step 2: Apply** — `npx supabase db push --include-all` (pushes to remote; if the CLI can't run for an env reason, keep the file + report). 
- [ ] **Step 3: Regenerate types** — `npm run db:types`; re-apply the `customers` HAND-NARROWED unions if reset.
- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260529000006_realtime_agent_messages.sql src/types/database.ts
git commit -m "feat(copilot): realtime-publish agent_messages for the copilot panel"
```

---

## Task 2: Copilot panel server actions

Thin, cookie-auth server actions (user-session client, RLS-scoped). They reuse the Phase 1/2 helpers.

**Files:**
- Create: `src/app/inbox/copilot-panel-actions.ts`

- [ ] **Step 1: Confirm the auth pattern**

Inbox/agent server code derives tenant via: `const user = await getServerUser(); const supabase = await createClient(); const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single(); const tenantId = userRow.tenant_id` (both `getServerUser` + `createClient` from `@/lib/supabase/server`). Match it.

- [ ] **Step 2: Write the actions**

`src/app/inbox/copilot-panel-actions.ts`:

```ts
'use server'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { getOrCreateCopilotSession } from '@/lib/agent/copilot/session'
import { readDraftOrder } from '@/lib/agent/copilot/draft-order'

async function ctx() {
  const user = await getServerUser()
  if (!user) return null
  const supabase = await createClient()
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return null
  return { supabase, tenantId: userRow.tenant_id as string }
}

export interface CopilotTimelineMessage {
  id: string
  role: string
  content: string | null
  toolCalls: { id: string; name: string; input: Record<string, unknown>; output: unknown; status: string }[]
  createdAt: string
}

/** The copilot session id for a conversation (created lazily if absent). */
export async function getCopilotSessionId(conversationId: string): Promise<string | null> {
  const c = await ctx()
  if (!c) return null
  return getOrCreateCopilotSession(c.supabase, c.tenantId, conversationId)
}

/** The persisted copilot turns for a session, oldest first. */
export async function getCopilotTimeline(sessionId: string): Promise<CopilotTimelineMessage[]> {
  const c = await ctx()
  if (!c) return []
  const { data } = await c.supabase
    .from('agent_messages')
    .select('id, role, content, tool_calls, created_at')
    .eq('session_id', sessionId)
    .eq('tenant_id', c.tenantId)
    .order('created_at', { ascending: true })
  return (data ?? []).map(m => ({
    id: m.id as string,
    role: m.role as string,
    content: (m.content as string | null) ?? null,
    toolCalls: ((m.tool_calls as CopilotTimelineMessage['toolCalls'] | null) ?? []),
    createdAt: m.created_at as string,
  }))
}

/** The conversation's live draft order (or null). */
export async function getConversationDraftOrder(conversationId: string): Promise<unknown> {
  const c = await ctx()
  if (!c) return null
  return readDraftOrder(c.supabase, c.tenantId, conversationId)
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` → no new errors.
```bash
git add src/app/inbox/copilot-panel-actions.ts
git commit -m "feat(copilot): server actions for the copilot panel (session/timeline/draft order)"
```

---

## Task 3: Timeline mapping helper (pure, tested)

The realtime payload + the server action both yield `agent_messages` rows; normalize them into a render model and dedupe. Pure logic, unit-tested.

**Files:**
- Create: `src/components/inbox/copilot/timeline.ts`
- Create: `src/components/inbox/copilot/__tests__/timeline.test.ts`

- [ ] **Step 1: Write the failing test**

`src/components/inbox/copilot/__tests__/timeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapAgentRow, upsertMessage, type CopilotMsg } from '../timeline'

describe('mapAgentRow', () => {
  it('maps a raw agent_messages row to a CopilotMsg', () => {
    const row = { id: 'm1', role: 'assistant', content: 'Added 2x Reta.', tool_calls: [{ id: 't1', name: 'update_draft_order', input: {}, output: null, status: 'complete' }], created_at: '2026-05-29T10:00:00Z' }
    expect(mapAgentRow(row as never)).toEqual({
      id: 'm1', role: 'assistant', content: 'Added 2x Reta.',
      toolCalls: [{ id: 't1', name: 'update_draft_order', input: {}, output: null, status: 'complete' }],
      createdAt: '2026-05-29T10:00:00Z',
    })
  })
  it('defaults null tool_calls to []', () => {
    expect(mapAgentRow({ id: 'm2', role: 'user', content: '[CUSTOMER] hi', tool_calls: null, created_at: 't' } as never).toolCalls).toEqual([])
  })
})

describe('upsertMessage', () => {
  it('appends a new message', () => {
    const a: CopilotMsg = { id: 'm1', role: 'assistant', content: 'a', toolCalls: [], createdAt: 't1' }
    const b: CopilotMsg = { id: 'm2', role: 'assistant', content: 'b', toolCalls: [], createdAt: 't2' }
    expect(upsertMessage([a], b)).toEqual([a, b])
  })
  it('replaces an existing message by id (e.g. tool_calls status update)', () => {
    const a: CopilotMsg = { id: 'm1', role: 'assistant', content: 'a', toolCalls: [{ id: 't1', name: 'finalize_order', input: {}, output: null, status: 'pending' }], createdAt: 't1' }
    const updated: CopilotMsg = { ...a, toolCalls: [{ id: 't1', name: 'finalize_order', input: {}, output: { ok: true }, status: 'complete' }] }
    expect(upsertMessage([a], updated)).toEqual([updated])
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npm run test:run -- src/components/inbox/copilot/__tests__/timeline.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write the helper**

`src/components/inbox/copilot/timeline.ts`:

```ts
export interface CopilotToolCall { id: string; name: string; input: Record<string, unknown>; output: unknown; status: string }
export interface CopilotMsg { id: string; role: string; content: string | null; toolCalls: CopilotToolCall[]; createdAt: string }

interface RawAgentRow { id: string; role: string; content: string | null; tool_calls: CopilotToolCall[] | null; created_at: string }

export function mapAgentRow(row: RawAgentRow): CopilotMsg {
  return {
    id: row.id,
    role: row.role,
    content: row.content ?? null,
    toolCalls: row.tool_calls ?? [],
    createdAt: row.created_at,
  }
}

/** Append or replace-by-id, keeping chronological order. */
export function upsertMessage(list: CopilotMsg[], msg: CopilotMsg): CopilotMsg[] {
  const idx = list.findIndex(m => m.id === msg.id)
  if (idx === -1) return [...list, msg]
  const next = list.slice()
  next[idx] = msg
  return next
}
```

- [ ] **Step 4: Run to verify it passes** — PASS (4 tests).
- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/copilot/timeline.ts src/components/inbox/copilot/__tests__/timeline.test.ts
git commit -m "feat(copilot): timeline mapping + upsert helper"
```

---

## Task 4: `useCopilotSession` hook (data + realtime + actions)

Loads the session, timeline, and draft order; subscribes to `agent_messages` realtime; exposes `send(text)` and `confirm(messageId, toolCallId, confirmed)`. No JSX — pure data/behavior so the panel component (Task 5) is design-only.

**Files:**
- Create: `src/components/inbox/copilot/useCopilotSession.ts`

- [ ] **Step 1: Write the hook**

`src/components/inbox/copilot/useCopilotSession.ts`:

```ts
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCopilotSessionId, getCopilotTimeline, getConversationDraftOrder } from '@/app/inbox/copilot-panel-actions'
import { mapAgentRow, upsertMessage, type CopilotMsg } from './timeline'

export interface DraftOrderView {
  id: string; ref_number: string; status: string; payment_amount: number
  payment_asset: string | null; currency: string; shipping_address: unknown
  order_items: { product_id: string; qty: number; unit_price_snapshot: number }[]
}

export function useCopilotSession(conversationId: string) {
  const supabase = useRef(createClient()).current
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CopilotMsg[]>([])
  const [draftOrder, setDraftOrder] = useState<DraftOrderView | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const refreshDraft = useCallback(async () => {
    setDraftOrder((await getConversationDraftOrder(conversationId)) as DraftOrderView | null)
  }, [conversationId])

  // Load session + timeline + draft on conversation change.
  useEffect(() => {
    let cancelled = false
    setLoading(true); setMessages([]); setDraftOrder(null); setSessionId(null)
    ;(async () => {
      const sid = await getCopilotSessionId(conversationId)
      if (cancelled || !sid) { setLoading(false); return }
      setSessionId(sid)
      const [tl] = await Promise.all([getCopilotTimeline(sid), refreshDraft()])
      if (cancelled) return
      setMessages(tl.map(m => ({ id: m.id, role: m.role, content: m.content, toolCalls: m.toolCalls, createdAt: m.createdAt })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [conversationId, refreshDraft])

  // Realtime: agent_messages for this session → upsert timeline + refresh draft.
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`agent_messages:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => { setMessages(prev => upsertMessage(prev, mapAgentRow(payload.new as never))); void refreshDraft() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agent_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => { setMessages(prev => upsertMessage(prev, mapAgentRow(payload.new as never))); void refreshDraft() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, supabase, refreshDraft])

  /** Operator command → an [OPERATOR]-tagged copilot turn. Persisted turns
   * arrive via realtime; we don't parse the SSE here. */
  const send = useCallback(async (text: string) => {
    if (!sessionId || !text.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: `[OPERATOR] ${text.trim()}` }),
      })
      // Drain the SSE stream so the turn completes server-side; ignore the body.
      await res.text().catch(() => {})
    } finally { setSending(false) }
  }, [sessionId])

  const confirm = useCallback(async (messageId: string, toolCallId: string, confirmed: boolean) => {
    if (!sessionId) return
    const res = await fetch('/api/agent/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, messageId, toolCallId, confirmed }),
    })
    await res.text().catch(() => {})
  }, [sessionId])

  return { sessionId, messages, draftOrder, loading, sending, send, confirm, refreshDraft }
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → no new errors. (No unit test for the hook; it's exercised via the panel + integration. The pure logic it relies on is tested in Task 3.)
- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/copilot/useCopilotSession.ts
git commit -m "feat(copilot): useCopilotSession hook (timeline realtime + send/confirm)"
```

---

## Task 5: The CopilotPanel (frontend-design, world-class)

**REQUIRED SKILL: invoke `frontend-design` for this task.** This is the centerpiece — a distinctive, production-grade agentic conversational panel. Do NOT reproduce the old `InboxAIPanel` look.

**Files:**
- Create: `src/components/inbox/copilot/CopilotPanel.tsx` (+ any sub-components it needs under `src/components/inbox/copilot/`)
- Create/Modify: `styles/copilot.css` (or append to `styles/inbox.css`) — `pt-*` classes, no Tailwind.

**Functional contract (must hold; the design decides the form):**
- Takes `{ conversationId, customerName }`. Uses `useCopilotSession(conversationId)`.
- **Timeline** (from `messages`): render each `CopilotMsg` chronologically.
  - `role` `'assistant'` with `content` → a **commentary** entry (the agent narrating; e.g. "Added 2× Retatrutide to the draft order.").
  - `assistant` `toolCalls` → compact **action chips/rows** ("Built draft order", "Set shipping") using each call's `name`/`input`; resolved (`status:'complete'`) vs `pending`.
  - `role` `'user'` content tagged `[CUSTOMER]`/`[OPERATOR]`/`[SENT]` → render as the corresponding voice (or hide `[CUSTOMER]` mirrors if the design prefers a clean agent-only feed — design call, but keep operator commands visible).
  - **Confirm cards**: any `toolCall` with `status:'pending'` → an approve/reject card. Approve → `confirm(msg.id, tc.id, true)`; reject → `confirm(..., false)`. Model the interaction on `src/components/agent/AgentView.tsx` (`.pt-agent-confirm` markup + the `confirm()` fetch) but design it freshly. Use `summariseToolCall` if available, else the tool name + key inputs.
- **Live draft-order surface** (from `draftOrder`): a panel/section showing the building order — line items (`qty × product`, priced via `formatAmount(qty*unit_price_snapshot, draftOrder.currency)`), total (`formatAmount(payment_amount, currency)`), shipping + payment asset when set. Empty/hidden when `draftOrder` is null. It updates live (the hook refetches on each timeline change).
- **Composer**: a text input + send → `send(text)`; disabled while `sending`. This is how the operator commands the agent ("add 2 more", "ask about shipping", "finalize it").
- **Loading**: a tasteful loading state while `loading`.
- Everything is internal/tenant-only (the customer never sees it).

**Aesthetic brief (frontend-design):** world-class agentic copilot panel — confident, alive, and distinctive. Think a premium AI-copilot surface: a clear sense of the agent "working" (subtle activity affordances on new turns), a calm but characterful palette consistent with the Peptech `pt-*` design system (warm, soft-fill, `oklch` tokens — see `styles/peptech.css`), excellent typographic rhythm for a dense feed, commentary that reads like a sharp colleague's notes, action/confirm cards that feel tactile and decisive, and a draft-order surface that feels like a live receipt building in real time. Micro-interactions on arrival/approve (the user likes spring/あ multi-stage confirms — see `feedback_microinteractions`). Avoid generic chat-bubble AI-slop. Make it something the user is proud to demo.

- [ ] **Step 1:** Invoke `frontend-design`. Build `CopilotPanel.tsx` (+ sub-components) against the functional contract above, with the aesthetic brief. Wire it to `useCopilotSession`.
- [ ] **Step 2:** `npx tsc --noEmit` → no new errors. (Component tests can't run locally — known `@testing-library/dom` gap. Verify via tsc + manual.)
- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/copilot/ styles/
git commit -m "feat(copilot): world-class agentic copilot panel"
```

- [ ] **Step 4: DESIGN REVIEW CHECKPOINT** — pause and show the user (screenshot/dev server) before wiring it in as the default. Iterate on the look with them. (The controller surfaces this to the user; do not silently proceed past a design milestone.)

---

## Task 6: Mount the panel in the rail (replace InboxAIPanel)

**Files:**
- Modify: `src/components/inbox/RailPanelHost.tsx`
- Modify: `src/components/inbox/RailStrip.tsx`

- [ ] **Step 1: Swap the `'ai'` panel render**

In `RailPanelHost.tsx`, replace the `panel === 'ai'` branch that renders `<InboxAIPanel .../>` with `<CopilotPanel conversationId={thread.id} customerName={thread.name} />` (import from `./copilot/CopilotPanel`). Keep the `thread.id && thread.customerId` guard. Update the `TITLES` map entry for `ai` if the design renames it (e.g. `ai: 'Copilot'`).

- [ ] **Step 2: Repoint the rail badge**

In `RailStrip.tsx`, the badge currently counts `useInbox().suggestions` (removed in Task 7). Repoint it to a copilot signal OR drop it. Simplest for Phase 3: **drop the badge** (remove the `suggestions`/`count`/`pulse` logic and the `<span className="pt-ix-strip-badge">`), since the panel itself now surfaces activity. (A copilot-open-count badge can be a fast-follow.) Update the `'ai'` item label to `'Copilot'` if the design prefers.

- [ ] **Step 3: Type-check + manual** — `npx tsc --noEmit`; `npm run dev`, open `/inbox`, open the spark/Copilot rail item → the new panel renders for a conversation with copilot activity.
- [ ] **Step 4: Commit**

```bash
git add src/components/inbox/RailPanelHost.tsx src/components/inbox/RailStrip.tsx
git commit -m "feat(copilot): mount CopilotPanel in the rail; drop v1 suggestion badge"
```

---

## Task 7: Retire the v1 suggestion UI

Remove the v1 inline cards + provider wiring now that the panel supersedes them. (Leaves the `ai_suggestions` table + `src/lib/copilot/*` pipeline in place for now — the processor already calls `runCopilotWatch`, not the v1 pass, so no new suggestions are written; full table retirement is a separate cleanup.)

**Files:**
- Modify: `src/components/inbox/InboxView.tsx`, `src/components/inbox/InboxProvider.tsx`
- Delete: `src/components/inbox/InboxAIPanel.tsx`, `src/components/inbox/CopilotSuggestions.tsx`, `src/components/inbox/SuggestionCard.tsx`

- [ ] **Step 1: Remove the inline render (`InboxView.tsx`)**

Delete the `<CopilotSuggestions suggestions={...} variant="inline" />` block in `.pt-ix-stream` (~lines 823-826) and the `CopilotSuggestions` import (line 9). Remove `suggestions` from the `useInbox()` destructure in `ConversationPane` (line ~695) if now unused.

- [ ] **Step 2: Remove provider wiring (`InboxProvider.tsx`)**

Remove: the `suggestions` field from `InboxCtx` (line ~33), the `suggestions` state (line ~89), the imports of `getOpenSuggestions`/`mapSuggestionRow`/`SuggestionRow` (lines ~11-12), the `getOpenSuggestions` load effect (~410-415), the `ai_suggestions` realtime subscription (~417-445), and `suggestions` from the context value object (~516).

- [ ] **Step 3: Delete the dead components**

```bash
git rm src/components/inbox/InboxAIPanel.tsx src/components/inbox/CopilotSuggestions.tsx src/components/inbox/SuggestionCard.tsx
```
Then grep for any remaining import of these three (and of `useInbox().suggestions`) and remove them: `npx grep -rn "InboxAIPanel\|CopilotSuggestions\|SuggestionCard" src` (use the Grep tool). Fix any stragglers.

- [ ] **Step 4: Type-check + tests**

Run: `npx tsc --noEmit` → no new errors (and confirm nothing still references the deleted files / removed `suggestions`).
Run: `npm run test:run -- src/components/inbox src/types/__tests__/copilot.test.ts` — update/remove any test that referenced the deleted components. (The `src/types/copilot.ts` mappers may still be used by `copilot-actions.ts`; only remove tests tied to deleted UI.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(copilot): retire v1 inbox suggestion UI (superseded by CopilotPanel)"
```

---

## Task 8: Full-suite + integration sanity

- [ ] **Step 1: Suites** — `npm run test:run -- src/lib/agent src/lib/copilot src/lib/webhooks src/components/inbox` → pass (note pre-existing `@testing-library/dom` component-test load gap; confirm no NEW failures from your changes).
- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → no new errors.
- [ ] **Step 3: Integration (deploy/local + OpenRouter key), `copilot_enabled=true`:**
  1. Open `/inbox`, open a conversation, open the Copilot rail panel.
  2. Inbound customer message ("how much is RETA-10? I'll take 2 + a bpc") → within a few seconds the panel shows the agent's **commentary + action chips live** (via `agent_messages` realtime) and the **draft-order surface** populates (2× Retatrutide + 1× BPC-157, total in tenant currency).
  3. Type an operator command ("ask them for the shipping address") → the agent turn appears in the panel.
  4. When the agent proposes `finalize_order`, a **confirm card** appears → Approve → the draft flips to a real order (status `created`) and the card resolves.
  5. Confirm the **v1 inline suggestion cards no longer appear** in the conversation stream.
- [ ] **Step 4: Commit any fixes.**

---

## Verification (whole plan)

- **Unit:** `mapAgentRow`/`upsertMessage` (mapping + append/replace-by-id); server-action shapes via type-check.
- **Integration:** copilot panel renders the session live; operator command runs a turn; confirm card approves `finalize_order`; draft-order surface updates; v1 cards gone.
- **Design:** the panel is a distinctive, world-class agentic surface (design-review checkpoint with the user in Task 5).

## Out of scope (Phase 3)

- `send_message` + `generate_payment_link` (the customer-facing senders) → still **Phase 2b**.
- Retiring the `ai_suggestions` table + `src/lib/copilot/*` pipeline + `src/types/copilot.ts` mappers (the processor no longer writes suggestions; table cleanup is a later chore).
- The `[OPERATOR]`/`[SENT]` mirroring of operator-sent customer messages into the session (operator *commands to the agent* are handled via the composer here; mirroring operator→customer `[SENT]` messages is Phase 2b/later).
- A copilot-activity rail badge (dropped in Task 6; fast-follow).
- Live realtime for the draft-order surface via publishing `orders` (Phase 3 refetches on timeline change instead).
