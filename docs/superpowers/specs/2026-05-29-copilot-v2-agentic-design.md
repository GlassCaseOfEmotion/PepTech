# Inbox AI Copilot v2 — Agentic, Stateful Conversation Agent

**Date:** 2026-05-29
**Status:** Design approved, pending spec review

## Context

Copilot v1 (shipped, behind the per-tenant `copilot_enabled` toggle) is a **stateless, discrete** pipeline: each inbound customer message runs an independent pass (`classify → draft → dedup → persist`) that emits standalone, approve-each suggestion cards into `ai_suggestions`. It works for the rigid use cases it was scoped for (cross-sell, quote, draft order), but it has no memory, builds nothing up over time, and can only surface cards — it can't *narrate*.

The desired end state is a **fluid, model-driven agent** that watches each conversation, builds commerce artifacts up over many messages, narrates what it's doing ("added 4 items to the draft order… should I ask about shipping?"), and — over time, as trust grows — manages the whole order through to payment with the tenant supervising. The long-term vision is full autonomy (the agent replies on the tenant's behalf); for now we keep approval gates on customer-facing and committing actions, but the architecture is built for autonomy from the start.

**Key realization:** the agentic copilot is a *convergence* with the existing ops/onboarding agent (`src/lib/agent/executor.ts`) — a model-driven tool-calling loop with per-session memory and a built-in confirm/execute gate (`requiresConfirmation`). v2 reuses that substrate rather than extending the v1 JSON pipeline. The internal-vs-customer-facing approval split maps exactly onto `requiresConfirmation`.

## Locked decisions

- **Unified per-conversation agent.** One agent the tenant both *watches* (it proactively acts + narrates) and *commands* (chats with it in the rail panel). One session, one memory — not a separate background copilot + separate ask-AI chat.
- **Agentic, model-driven** (not the deterministic v1 pipeline). The model drives tools; our code no longer hard-codes the classify→draft steps.
- **Internal / customer-facing approval split**, implemented via `requiresConfirmation`:
  - *Internal, reversible* (build/edit a **draft** order, set shipping, post commentary) → auto-execute + narrate.
  - *Customer-facing / committing* (send a message, finalize the order, generate a payment link) → gated approve-cards.
  - Gates are a **dial that loosens over time** (flip a tool gated→auto; later a per-tenant autonomy level).
- **Working order = a real `orders` record at a new `'draft'` status** (one per conversation), reusing `order_items`/pricing/the order detail page, hidden from the default Orders list until finalized.
- **Transport-agnostic turn core + sinks** (see Architecture). The agent loop runs both headless (background, per inbound) and streamed (interactive panel) on the same session.
- **One source of truth for the copilot timeline:** render commentary + gated cards from the copilot session's `agent_messages`. Retire the separate `ai_suggestions` store for v2.
- **Cost/gates are not a current constraint** — build the right architecture. Keep the per-tenant `copilot_enabled` toggle and an optional cheap pre-filter as a relevance gate, but don't let cost shape the design.

## Architecture

### Turn core + sinks (refactor of `executor.ts`)

Extract the tool-calling/confirm/recursion loop from `executeAgentTurn`/`continueTurn` into a **transport-agnostic core** that emits events to a **sink** interface (e.g. `onText`, `onToolUse`, `onConfirm`, `onDone`, `onError`). Two sinks:

- **Streaming sink** — the interactive rail panel; streams over SSE exactly as today.
- **Headless sink** — the background pass; no browser. It persists the agent's turn (assistant message with commentary text + any tool calls) and lets the realtime subscription surface it. Gated tool calls are persisted as `pending` for later approval.

The existing ops/onboarding agent continues to work through the streaming sink — it simply stops being hardwired to a `ReadableStreamDefaultController`. The model loop, `requiresConfirmation` gating, `TERMINAL_TOOLS` handling, empty-completion retry, and `MAX_CONTINUATION_DEPTH` recursion are preserved in the core.

### Session & memory (mirrored transcript)

One `agent_sessions` row per conversation, `trigger='copilot'`, linked to `conversation_id`. The agent's memory is that session's `agent_messages`. To give the agent one coherent view of all three voices, **messages are mirrored into the session, tagged by source**:

- Customer inbound → `user` message tagged `[CUSTOMER]`.
- Tenant→customer sends → `user` message tagged `[SENT]` (so the agent knows what's already been said to the customer).
- Tenant→agent commands (panel) → `user` message tagged `[OPERATOR]`.
- The agent's own turns (commentary + tool calls + results) → `assistant`/`tool` messages.

The session is one interleaved transcript the agent always sees in full. **Turn triggers:** a new `[CUSTOMER]` message (background/proactive turn) or an `[OPERATOR]` message (interactive turn). The agent's own actions never self-trigger; a turn runs its tool loop to completion, then yields until the next customer/operator message. The copilot system prompt explains the three voices and the agent's job (watch, build the order, narrate, propose customer-facing actions for approval).

### Tool set (copilot mode)

A new `'copilot'` `AgentMode` with its own tool set assembled in `tools/index.ts`:

- **Read (auto):** `query_catalog`, `get_customer`, `get_conversation_messages`, `get_peptide_reference` (informal-name → canonical matching), `get_draft_order`.
- **Internal — auto-execute (no confirm):** `update_draft_order` (add/remove/set line items, sized from catalog + reference protocol), `set_shipping_address`, `set_payment_asset`, `post_commentary` (the running narration).
- **Customer-facing / committing — gated (`requiresConfirmation: true`):** `send_message` (deliver to the customer via `/api/send` + channel dispatch), `finalize_order` (draft → real order), `generate_payment_link` (NOWPayments/Privy).

### Draft-order lifecycle

- Add a `'draft'` status to `orders`. One draft order per conversation (the working order), created lazily on first item add.
- `update_draft_order` / `set_shipping_address` / `set_payment_asset` mutate it via the existing order tables.
- Excluded from the default Orders list (filter out `'draft'`) until finalized.
- `finalize_order` flips `draft → 'created'` (enters the normal pipeline); `generate_payment_link` is the path to payment. The same record progresses end-to-end.

### Surfaces

One source of truth — the copilot session's `agent_messages` — rendered three ways:

- **Right-rail panel → unified copilot chat:** running commentary + agent turns + an input box to command the agent.
- **Inline in the conversation thread:** commentary notes + gated approve-cards interleave (internal-only; the customer never sees them).
- **Draft order:** a live card/panel (items, shipping, total in the tenant's currency via `formatAmount`) that updates as the agent builds it, with the gated Finalize / Payment-link actions.

The inbox realtime-subscribes to the session's `agent_messages`. Gated pending tool calls render as the approve cards modeled on `PendingApprovalCard`; commentary renders as timeline notes.

## Migration from v1

- v2 **replaces** the v1 classify→draft→`ai_suggestions` pipeline; the two do not run simultaneously — flip over behind the existing `copilot_enabled` toggle.
- Keep the cheap pre-filter classifier as an optional relevance gate ("is this worth a turn?"); it is no longer load-bearing for correctness.
- Stop writing `ai_suggestions`; retire the table in a later cleanup (leave it in place initially to avoid a destructive migration).
- The v1 `SuggestionCard` / `CopilotSuggestions` components evolve into the session-driven commentary + confirm-card rendering. The currency formatting, rail badge/pulse, internal-card styling, and `after()` reliability work all carry forward.

## Data model changes

- `agent_sessions`: support `trigger='copilot'` and add a `conversation_id` link (nullable; set for copilot sessions).
- `orders`: add `'draft'` to the status set; exclude `'draft'` from default order listing queries.
- Copilot timeline (commentary + gated cards): stored in `agent_messages` — **no new table**.
- Draft-order ↔ conversation: the existing `orders.conversation_id` relation; enforce one open draft per conversation.

All new/changed tables stay tenant-scoped with RLS per `CLAUDE.md`. The background turn runs on the **service-role client** (no user session in a webhook), so every query it issues must filter by `tenant_id` explicitly — RLS does not protect service-role queries. (This is the v1 lesson: the reused read tools are already tenant-scoped; new copilot tools must be too.)

## Phasing (each phase ships + tests independently; each gets its own plan)

1. **Core + session.** Refactor `executor.ts` into the transport-agnostic core + streaming sink (existing agent unchanged in behavior). Add the copilot session (`trigger='copilot'`, `conversation_id`), the headless sink, the per-inbound background trigger (mirroring `[CUSTOMER]`/`[SENT]` messages into the session), the `'copilot'` mode + system prompt, `post_commentary`, and reuse the existing read tools. **Outcome:** an inbound message makes the agent watch the conversation and narrate via commentary persisted to the session — verifiable without any new commerce tools or UI.
2. **Commerce tools + draft order.** Add the `'draft'` order status, the draft-order entity (one per conversation), and the tools: `update_draft_order`, `set_shipping_address`, `set_payment_asset`, `get_draft_order`, `get_peptide_reference`, and the gated `send_message`, `finalize_order`, `generate_payment_link`. **Outcome:** the agent builds/edits a real draft order and queues gated customer-facing actions.
3. **Unified UI.** The rail panel becomes the copilot chat (command box + commentary + agent turns); inline commentary + confirm cards render from the session; the live draft-order surface; retire the v1 cards. **Outcome:** the full watch-build-narrate-approve loop in the inbox.

## Non-goals

- **Full autonomy now.** Customer-facing and committing actions stay gated in v1→v3; autonomy widens later by flipping `requiresConfirmation`.
- **Changing the existing payment-detection / order-auto-advance flow** (already works).
- **Multi-conversation / cross-customer reasoning.** The agent is scoped to one conversation's session.
- **Retiring the ops/onboarding agent.** It keeps running through the streaming sink; v2 only refactors the shared core, it does not change ops/onboarding behavior.

## Verification (overall)

- **Unit:** the turn core with a fake model + a recording sink (tool loop, confirm gating, recursion, terminal-tool handling); each copilot tool handler (tenant-scoped queries, draft-order mutations); message-mirroring/tagging.
- **Integration:** an inbound message on an opted-in tenant runs a copilot turn that posts commentary to the session; an `[OPERATOR]` command runs an interactive turn; `update_draft_order` produces a real `'draft'` order; a gated tool surfaces as a pending confirm card and executes on approval; finalize flips status into the normal pipeline.
- **Reliability:** the background turn runs via `after()` and survives the serverless response (the v1 lesson); the existing ops/onboarding agent behavior is unchanged after the core refactor (regression check).
- **Manual:** walk a real Telegram conversation — the agent narrates, builds the draft order across messages, captures shipping, and the gated send/finalize/payment-link actions work end-to-end.

## Open / deferred to the plans

- Exact `'copilot'` system-prompt wording (tune in QA).
- Whether to keep or drop the pre-filter relevance gate in Phase 1.
- Per-tenant "autonomy level" control (post-v3).
- One-open-draft-per-conversation enforcement mechanism (unique partial index vs application check) — settle in Phase 2.
- Exact sink event interface shape — settle in Phase 1.
