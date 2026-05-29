# Inbox AI Copilot — Proactive Conversation Suggestions

**Date:** 2026-05-29
**Status:** Design approved, pending spec review

## Context

Today the inbox AI is reactive: a panel (`InboxAIPanel`) where the tenant types a prompt and gets a text answer; it even throws away the agent's tool/confirm events. Meanwhile the tenant manually does the commerce work as a conversation unfolds — spotting cross-sells, building orders, quoting prices, drafting replies, sending payment links.

The goal: a **proactive copilot** that watches each conversation as it progresses and *drafts those actions for the tenant to approve*, inline in the chat and in a side panel — like the website animation (an "AI CROSS-SELL · SUGGESTED — TB-500 pairs with BPC in 67% of similar protocols · +$108" card appearing mid-conversation, leading to a one-tap reply, a payment link, and the order auto-advancing).

**The good news from the codebase audit:** ~70% exists. The ops agent already has tools to `create_order`, `query_catalog` (live stock/margins), `get_customer` (history), and read conversation messages, with a working **approve-to-execute** flow (`/api/agent/confirm`). There's an **approval-queue pattern** (`automation_runs` queued → `PendingApprovalRow` → review/edit/send → `/api/send`). Cross-sell data (co-product affinity, top-5 per product from 30-day order history), reorder/velocity signals, and protocol-based supply math (`computeSupply`) all exist. The crypto **payment-link** flow (NOWPayments/Privy) and **on-chain detection + auto-advance** already work — that's the back half of the animation.

The missing pieces: (1) nothing runs as a conversation *progresses* (automations only fire once, on `new_thread`), (2) no "analyst" that reads the running conversation and decides an action, (3) the panel can't surface drafted actions, (4) no `send_message` agent tool and no "quote" concept.

## Locked decisions

- **Per-inbound-message trigger** — one LLM pass per inbound message, gated by a cheap pre-filter classifier for cost.
- **Everything stays draft** — nothing is sent to the customer or committed without the tenant approving/editing first.
- **Two surfaces, both:** internal **inline cards** in the conversation timeline (tenant-only — the customer NEVER sees them) AND a right-rail **Copilot panel** (the running list of live suggestions for the open conversation + a manual "ask AI" box). Same underlying suggestion, two views.
- **One review pattern:** every suggestion is actioned *in its card* — review → edit-in-place → send/commit. No loading into the composer (avoids the action living in two places). Same UX as the existing `PendingApprovalRow`.
- **No cap** on active suggestions — let the stream grow as the conversation progresses; **dedup** instead (never resurface the same suggestion).
- **Reactivation:** an inbound message on a resolved/snoozed thread reactivates it (→ needs_reply) and runs the copilot.
- **Show reasoning + a confidence signal** (e.g. "67% of similar protocols"); only surface above a confidence threshold.

## Suggestion kinds (v1)

| Kind | What it is | On approve |
|------|-----------|-----------|
| `cross_sell` | "TB-500 pairs with BPC in 67% of similar protocols (+$108)" — a product to add, with affinity reasoning | Adds the item to a draft order (or starts one) and/or drafts the offer message |
| `draft_order` | An actual order record at `status:'created'` (items + total), sized via protocol math when relevant | `createOrder` commits it; nothing sent until a follow-up send/payment-link |
| `quote` | A drafted **message** stating price + availability for what the customer asked ("RETA-10 is $X, in stock") — no DB record | `/api/send` delivers the (edited) message |
| `reply` | A drafted conversational reply (e.g. "Quick add — want to throw in TB-500 this time?") | `/api/send` delivers the (edited) message |
| `payment_link` | Generate a crypto payment link (existing NOWPayments/Privy infra) for a draft order — the card in the animation | Creates + sends the payment link | 

`payment_link` is the **droppable** one if the plan gets heavy (fast-follow).

## Architecture — monitor → analyze → draft → store → surface → approve

1. **Trigger (per inbound message).** In `processInboundMessage` (`src/lib/webhooks/processor.ts`), after the message is inserted, fire a fire-and-forget copilot pass (mirroring the existing `new_thread` automation dispatch). First ensure inbound **reactivates** resolved/snoozed conversations to `needs_reply` (verify/fix current behaviour). Debounce: collapse a rapid burst of inbound messages into a single pass.
2. **Pre-filter (cheap).** A fast, cheap classifier pass over the recent conversation answers "is there an actionable moment?" (product interest / stock or price question / reorder-due / ready-to-buy / good cross-sell point). If no → stop (cost control). Gated per-tenant by a copilot **on/off toggle**.
3. **Drafting pass.** If actionable, a richer agent pass uses the existing tools (`query_catalog`, `get_customer`, co-product affinity, `computeSupply` protocol math, conversation history) to produce one or more concrete suggestions with `kind`, `payload`, `confidence`, `reasoning`.
4. **Store + dedup.** Persist to a new typed `ai_suggestions` table (see below). Dedup against open suggestions on the same conversation (same kind + same target product/order) — don't resurface.
5. **Surface (realtime).** The inbox subscribes to `ai_suggestions` inserts for the open conversation; new suggestions appear as inline cards in the stream (time-ordered, internal styling) and in the Copilot panel, with a badge/pulse on the right-rail AI icon.
6. **Approve / edit / dismiss (in card).** Approve runs the existing flow for that kind: `createOrder` for orders, `/api/send` for quote/reply, payment-link generation for payment_link. Edit-in-place before send. Dismiss marks it dismissed.

## New pieces to build

- **`ai_suggestions` table** — `id, tenant_id, conversation_id, customer_id, kind, status ('open'|'sent'|'committed'|'dismissed'|'expired'), payload (jsonb), confidence (numeric), reasoning (text), created_at`. RLS tenant-scoped; published for realtime.
- **Copilot pipeline** — `src/lib/copilot/` : the pre-filter classifier, the drafting pass (reusing agent tools), and the dedup/persist logic. Invoked from `processInboundMessage`.
- **`send_message` agent tool** — so the drafting pass / approve flow can deliver a message via `/api/send`. (Reuses the existing send route + channel dispatch.)
- **Suggestion card components** — one card component with the review/edit/send-in-place state machine (model it on `PendingApprovalRow`), rendered in two places: inline in `.pt-ix-stream` (internal styling, distinct from real bubbles) and in the Copilot panel.
- **Copilot panel** — upgrade `InboxAIPanel` (or a sibling) to render the live suggestion list + keep the manual ask-AI box.
- **Realtime subscription** — inbox subscribes to `ai_suggestions` for the active conversation.
- **Tenant copilot toggle** — settings flag to enable/disable (cost opt-in + mute).
- **Reactivation fix** — inbound on resolved/snoozed → `needs_reply`.

## Reuse (do NOT rebuild)

- `create_order` (agent tool + `createOrder` action) for `draft_order`.
- `/api/send` + `src/lib/channels/*` for delivering `quote`/`reply`/payment-link messages.
- Co-product affinity (`catalog/page.tsx` computation) + `computeSupply` (`src/types/protocols.ts`) as the cross-sell / quantity brains.
- NOWPayments/Privy payment-link flow for `payment_link`.
- `PendingApprovalRow` interaction model for the card state machine.
- The agent executor's confirm/execute plumbing as a reference (the copilot's approve path can be simpler/direct since each suggestion kind maps to a known action).

## Non-goals

- **No auto-send / auto-commit.** Human approves everything customer-facing or order-creating.
- **No new "quote" entity.** Quote = a drafted message.
- **No multi-agent / autonomous selling.** The copilot suggests; the tenant decides.
- **Not changing** the existing payment-detection / order-auto-advance flow (already works).

## Cost model

One LLM call per inbound message, but the **cheap pre-filter** short-circuits the expensive drafting pass for non-actionable messages. Per-tenant toggle makes it opt-in. (Pick a cheap classify model — e.g. Haiku — and a capable draft model at plan time.)

## Verification

- Unit: pre-filter classification (actionable vs not) on sample transcripts; dedup logic; suggestion-payload → action mapping.
- Integration: an inbound message on a test conversation produces an `ai_suggestions` row of the right kind; approve → the order/message/payment-link actually happens via the existing flows; dismiss → status dismissed; a resolved thread + inbound → reactivated + suggestion produced.
- Manual: walk the animation end-to-end on the deploy — cross-sell card appears inline + in panel, approve drafts the reply, send delivers it, payment link generates, (existing) on-chain detection + auto-advance complete the loop.
- Cost check: confirm non-actionable inbound messages don't trigger the drafting pass.

## Open / deferred to the plan

- **`payment_link` in v1 vs fast-follow** — included for now, droppable.
- **Model choices** for pre-filter vs drafting.
- **Debounce window** for bursty inbound messages.
- **Confidence threshold** value (tune in QA).
- Exact `cross_sell` → order interaction (add-to-existing-draft vs start-new) — settle in the plan.
