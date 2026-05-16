# Command Palette + Compose Modal — Design Spec

## Goal

Wire up the two dead sidebar elements: the search field and the New Message button. Replace the AI-only ⌘K shortcut with a unified command palette (search + AI entry point), and build a compose modal for initiating outbound conversations.

---

## Background

The sidebar has two placeholder buttons with no functionality:
- **Search** (`pt-search`) — shows `⌘K` hint but ⌘K opens the AI assistant, not search
- **New message** (`pt-compose`) — shows `C` hint, does nothing

The `AgentPalette` component owns the ⌘K hotkey globally. The fix is to replace it with a `CommandPalette` that handles search and routes to the AI assistant, rather than rebuilding the AI chat itself.

No conversation-creation infrastructure exists for outbound messages — `/api/send` requires an existing `conversationId`. A new server action is needed.

---

## Architecture

Two new components, one new server action:

| File | Role |
|------|------|
| `src/components/shell/CommandPalette.tsx` | ⌘K overlay — search + AI entry |
| `src/components/shell/ComposeModal.tsx` | New message modal |
| `src/app/inbox/actions.ts` | New file — `sendNewMessage` server action |
| `src/components/shell/AgentPalette.tsx` | Remove ⌘K listener; expose `open()` ref |
| `src/components/shell/Sidebar.tsx` | Wire buttons to open palette / compose |
| `src/components/shell/Shell.tsx` | Mount `CommandPalette` + `ComposeModal` globally |

---

## Feature 1: CommandPalette

### Trigger
- ⌘K (Cmd/Ctrl+K) — global `keydown` listener in `CommandPalette`
- Click on sidebar search button (`pt-search`)
- Esc or backdrop click to close

### Layout
Centred modal with dark backdrop. Single input at top. Results grouped below:

```
┌─ ⌘K ──────────────────────────────────────┐
│ 🔍 Search customers, orders, conversations… │
├────────────────────────────────────────────┤
│ CUSTOMERS                                   │
│   [avatar] Alan Ambrose · +16175… · WA     │  ← navigates /customers/:id
├────────────────────────────────────────────┤
│ ORDERS                                      │
│   #A-1005 · T.B. · Packing                │  ← navigates /orders/:id
├────────────────────────────────────────────┤
│ CONVERSATIONS                               │
│   rxqueen · "when does my order ship?"     │  ← navigates /inbox?conversation=:id
├────────────────────────────────────────────┤
│ ✨ Open AI assistant →                      │  ← always visible, opens AgentPalette
└────────────────────────────────────────────┘
```

Empty state (no query): show 2–3 recently visited items stored in `localStorage` under `pt:recent`.

### Data sources
All queries run against Supabase client directly (RLS-scoped to tenant automatically):

**Customers:**
```typescript
supabase.from('customers')
  .select('id, display_name, customer_channels(channel_type, display_handle, is_primary)')
  .ilike('display_name', `%${q}%`)
  .limit(4)
```

**Orders:** search by ref number prefix OR customer name:
```typescript
supabase.from('orders')
  .select('id, ref_number, status, customers(display_name)')
  .ilike('ref_number', `%${q}%`)
  .limit(3)
```

**Conversations:**
```typescript
supabase.from('conversations')
  .select('id, last_message_snippet, customers(display_name)')
  .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
  .ilike('customers.display_name', `%${q}%`)
  .limit(3)
```

All queries debounced 200ms. No external search library needed.

### Keyboard navigation
- Arrow up/down moves highlight through results
- Enter navigates to highlighted result (or opens AI if "Open AI assistant" is highlighted)
- Results are a flat list for keyboard purposes despite visual grouping

### AI assistant row
Always pinned at the bottom. Clicking calls `agentPaletteRef.current?.open()` — the AgentPalette exposes an imperative handle via `useImperativeHandle` so CommandPalette can open it without ⌘K conflict.

### Recent items
On navigation from the palette, write `{ type, id, label, href }` to `localStorage` (`pt:recent`, max 5). Empty state reads and displays these.

### AgentPalette change
Remove the `keydown` ⌘K listener from `AgentPalette`. Add `useImperativeHandle` exposing `open()`. CommandPalette holds the ref and calls it when the AI row is selected.

---

## Feature 2: ComposeModal

### Trigger
- Sidebar "New message" button (`pt-compose`)
- Keyboard shortcut `C` (when no input is focused) — global `keydown` listener in `ComposeModal`
- Esc or backdrop click to close

### Layout
Standard `pt-modal-backdrop` / `pt-modal` pattern (same as ShipOrderModal).

**Step 1 — no customer selected:** search input with live dropdown of customer results.

**Step 2 — customer selected:** customer appears as a removable chip. Channel badge auto-fills to primary channel (with handle). If customer has multiple channels, show tab-style toggles. Message textarea. Send button labelled "Send via WhatsApp →" (or Telegram/Email).

### Customer search
Debounced call to `supabase.from('customers').select('id, display_name, customer_channels(...)').ilike('display_name', \`%${q}%\`).limit(8)` as user types. Same query as palette.

### Send flow
On submit:
1. Call `sendNewMessage(customerId, channelType, message)` server action
2. Action finds or creates a conversation, sends the message, returns `{ conversationId }`
3. On success: `router.push(\`/inbox?conversation=${conversationId}\`)`
4. On error: show inline error in modal

### `sendNewMessage` server action (`src/app/inbox/actions.ts`)

```typescript
export async function sendNewMessage(
  customerId: string,
  channelType: string,
  content: string
): Promise<{ conversationId: string } | { error: string }>
```

Logic:
1. Auth check
2. Get customer's channel identifier for `channelType` from `customer_channels`
3. Find existing non-resolved conversation (`status NOT IN ['resolved','archived']`) for this customer + channel. If found, reuse it.
4. If not found, insert new row into `conversations` (`customer_id`, `channel_type`, `channel_identifier`, `status: 'new'`, `tenant_id`)
5. Insert message row into `messages` (`conversation_id`, `direction: 'outbound'`, `content`, `tenant_id`)
6. Call the appropriate channel send function from `src/lib/channels/` (wa/tg/email) using the channel identifier
7. Update conversation `last_message_snippet`, `last_message_at`, `status: 'in_progress'`
8. `revalidatePath('/inbox')` and `revalidatePath('/')` (so dashboard activity feed updates)
9. Return `{ conversationId }`

---

## Shell mounting

Both components mount once in `src/components/shell/Shell.tsx` (or `DashboardLayout` if Shell doesn't exist as a wrapper). They render null when closed, so no per-page wiring needed.

```tsx
<CommandPalette agentRef={agentPaletteRef} />
<ComposeModal />
<AgentPalette ref={agentPaletteRef} />
```

The sidebar buttons open the modals via custom DOM events — lightweight, no prop drilling:
- Search button: `window.dispatchEvent(new CustomEvent('pt:palette:open'))`
- Compose button: `window.dispatchEvent(new CustomEvent('pt:compose:open'))`

`CommandPalette` and `ComposeModal` each listen for their event in a `useEffect` and set their own `open` state. The `C` keydown shortcut in `ComposeModal` and ⌘K in `CommandPalette` work the same way internally.

---

## Out of scope

- Searching by message content (full-text search requires DB index changes)
- Attach media in compose (existing send API supports it but adds complexity)
- Multi-recipient broadcast from compose (that's the broadcast page)

---

## Verification

1. ⌘K opens the palette. Typing "alan" shows Alan Ambrose under Customers, any #A-1xxx orders under Orders, and Alan's conversation under Conversations.
2. Clicking a customer result navigates to `/customers/:id`. Orders to `/orders/:id`. Conversations to `/inbox?conversation=:id`.
3. "Open AI assistant →" row opens the existing AI chat.
4. Esc closes the palette. Backdrop click closes it.
5. Sidebar search button opens the palette.
6. Pressing `C` (when no input focused) opens the compose modal.
7. Sidebar "New message" button opens the compose modal.
8. Selecting a customer in compose auto-fills their primary channel.
9. Sending a message navigates to `/inbox` with the conversation open.
10. Sending to a customer with an existing open conversation reuses it (no duplicate thread).
11. `npm run test:run` — all previously passing tests still pass.
