# Peptech — Customers + Inbox Design Spec
**Date:** 2026-04-27
**Phase:** 1 of N — Customers + Inbox
**Status:** Approved

---

## Overview

Peptech is a multi-tenant SaaS CRM for peptide dealers and suppliers. Platform owner (Peptech) sells access to tenant businesses, each of which manages their own customers, conversations, orders, and inventory.

This spec covers **Phase 1: Customers + Inbox** — the core entity (customer) and the omnichannel messaging inbox (WhatsApp, Telegram, Email). All other features (Orders, Catalog, Dashboard, Broadcasts, Automations, Vault) are downstream of this foundation and will be specced separately.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (Next.js App Router) |
| Backend / API routes | Next.js API routes (Node.js runtime) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Real-time | Supabase real-time subscriptions |
| Deployment | Vercel (app) + Supabase (DB) |
| WhatsApp | 360dialog Partner API |
| Telegram | Telegram Bot API |
| Email | Google OAuth (Gmail / Workspace) + Microsoft OAuth (Outlook / M365) |

---

## Multi-tenancy

Peptech is a multi-tenant platform. Every table (except `tenants` and `users`) carries a `tenant_id` foreign key. Supabase Row Level Security (RLS) enforces complete data isolation at the database level — no tenant can ever read or write another tenant's data.

RLS policy applied to every tenant-scoped table:
```sql
USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
```

---

## Data Model

### `tenants`
One row per peptide business subscribed to Peptech.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | Business display name |
| slug | text UNIQUE | e.g. `dr-gains` → `dr-gains.peptech.app` |
| plan | text | `starter \| pro \| enterprise` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `users`
People who log into Peptech on behalf of a tenant (staff, owners).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = `auth.uid` |
| tenant_id | uuid FK → tenants | |
| role | text | `owner \| admin \| member` |
| display_name | text | |
| email | text | |
| created_at | timestamptz | |

---

### `tenant_channels`
Each tenant's credentials for each connected messaging channel.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| channel_type | text | `whatsapp \| telegram \| email` |
| identifier | text | Phone number / bot username / email address |
| credentials | jsonb | Encrypted via pgsodium. See per-channel schema below. |
| webhook_secret | text | Used to verify inbound webhook signatures |
| is_active | bool | False if auth fails or manually disconnected |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**credentials schema by channel:**

WhatsApp (360dialog):
```json
{ "api_key": "...", "phone_number_id": "..." }
```

Telegram:
```json
{ "bot_token": "...", "bot_username": "..." }
```

Email (Google):
```json
{
  "provider": "google",
  "email_address": "support@example.com",
  "refresh_token": "...",
  "access_token": "...",
  "expires_at": "2026-04-27T12:00:00Z"
}
```

Email (Microsoft):
```json
{
  "provider": "microsoft",
  "email_address": "support@example.com",
  "refresh_token": "...",
  "access_token": "...",
  "expires_at": "2026-04-27T12:00:00Z"
}
```

---

### `customers`
One row per customer, channel-agnostic. A single customer can have multiple channel entries.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| display_name | text | Editable. Auto-set from first contact. |
| trust_score | int | 0–100. Manually set in v1. |
| ltv | numeric | Lifetime value in USD. Updated when orders confirmed. |
| notes | text | Internal freeform notes. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `customer_channels`
How to reach a customer on each channel they've contacted from.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| customer_id | uuid FK → customers | |
| channel_type | text | `whatsapp \| telegram \| email` |
| identifier | text | Phone number / Telegram chat ID / email address |
| display_handle | text | Human-readable: `+1 ••• 4421`, `@gymrat_84` |
| is_primary | bool | Preferred channel for outbound |
| created_at | timestamptz | |
| UNIQUE | (tenant_id, channel_type, identifier) | Prevents duplicate channel entries |

---

### `customer_tags`
Flat tag list per customer.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| customer_id | uuid FK → customers | |
| tag | text | e.g. `vip`, `repeat`, `new`, `waitlist`, `payment`, `referred` |
| created_at | timestamptz | |
| UNIQUE | (customer_id, tag) | |

---

### `conversations`
One thread per customer × channel. A customer with WhatsApp + Telegram has two conversation rows.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| customer_id | uuid FK → customers | |
| channel_type | text | `whatsapp \| telegram \| email` |
| channel_identifier | text | The specific handle/number this thread is on |
| status | text | `new \| needs_reply \| in_progress \| resolved \| snoozed` |
| unread_count | int | Denormalised. Incremented on inbound, zeroed on read. |
| last_message_at | timestamptz | Denormalised for sort performance. |
| last_message_snippet | text | Denormalised for list preview. |
| assigned_to | uuid FK → users | Nullable. For team assignment. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `messages`
Individual messages within a conversation.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| conversation_id | uuid FK → conversations | |
| direction | text | `inbound \| outbound` |
| content | text | Message body |
| sent_at | timestamptz | When sent/received by provider |
| status | text | `sending \| sent \| delivered \| read \| failed` |
| external_id | text | Provider's message ID. Used for deduplication. |
| metadata | jsonb | Provider-specific extras (e.g. delivery timestamps) |
| created_at | timestamptz | |
| UNIQUE | (tenant_id, external_id) where external_id IS NOT NULL | Prevents duplicate webhook deliveries |

---

### `notes`
Internal notes on a customer. Never sent to the customer.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| customer_id | uuid FK → customers | |
| content | text | |
| created_by | uuid FK → users | |
| created_at | timestamptz | |

---

### `quick_replies`
Pre-written reply templates, editable per tenant.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| label | text | Short name shown as chip e.g. "send wallet addr" |
| content | text | Full message text |
| sort_order | int | Display order in composer |
| created_at | timestamptz | |

---

## Channel Integration Architecture

### Inbound message flow

```
Customer sends message
        ↓
Provider fires webhook
        ↓
POST /api/webhooks/{channel}/{tenant_id}
        ↓
Validate webhook signature using tenant_channels.webhook_secret
        ↓
Upsert customer + customer_channel (auto-create on first contact)
Find or create conversation
Insert message row (idempotent via external_id unique constraint)
Update conversation.unread_count + last_message_snippet + last_message_at
        ↓
Supabase real-time broadcasts to connected frontend clients
        ↓
Inbox updates live (~200ms)
```

### Outbound message flow

```
Operator hits Send
        ↓
POST /api/send  { conversation_id, content }
        ↓
Insert message row (direction=outbound, status=sending)
Look up tenant_channels credentials for conversation's channel
Call provider API
        ↓
On success: update message.status = sent
On failure: update message.status = failed, surface error in UI
        ↓
Delivery/read receipts arrive as separate webhooks → update message.status
```

### Per-channel specifics

**WhatsApp — 360dialog**
- Tenant completes Meta business verification via Embedded Signup flow within Peptech settings
- 360dialog Partner API handles provisioning; we store the resulting API key
- Inbound webhook: `POST /api/webhooks/whatsapp/{tenant_id}`
- Outbound: 360dialog REST API
- Delivery receipts: separate webhook updates → `messages.status`

**Telegram — Bot API**
- Tenant creates bot via @BotFather (2-minute guided in-app walkthrough)
- On token save, Peptech calls `setWebhook` automatically
- Inbound webhook: `POST /api/webhooks/telegram/{tenant_id}`
- Outbound: `POST https://api.telegram.org/bot{token}/sendMessage`
- No read receipts — outbound messages marked `sent` on API success

**Email — OAuth (Google + Microsoft)**
- Tenant connects via standard OAuth popup (Google or Microsoft)
- Refresh token stored encrypted; access token refreshed automatically before API calls
- Inbound (Gmail): `gmail.users.watch()` → Google Pub/Sub → `POST /api/webhooks/email/{tenant_id}`
- Inbound (Microsoft): Graph change notification subscription → `POST /api/webhooks/email/{tenant_id}`
- Outbound: Gmail API `users.messages.send` / Microsoft Graph `sendMail`
- If token revoked: `tenant_channels.is_active = false`, operator notified to reconnect

### Conversation status transitions

| Status | Set when |
|---|---|
| `new` | Auto-created from first inbound contact (unknown customer) |
| `needs_reply` | Inbound message arrives on an existing conversation |
| `in_progress` | Operator sends a reply |
| `resolved` | Operator clicks "Resolve" |
| `snoozed` | Operator clicks "Snooze" (with optional wake time — v2) |

Inbound message on a `resolved` or `snoozed` conversation automatically moves it back to `needs_reply`.

---

### Auto-create on first contact

When an inbound webhook fires from an unknown identifier (no matching `customer_channels` row):
1. Create `customers` row with `display_name = identifier` (editable later)
2. Create `customer_channels` row
3. Create `conversations` row with `status = active`
4. Insert the message
5. Thread appears in inbox under "New"

---

## Inbox UI

### URL structure
```
/inbox                        → thread list, no active thread
/inbox/{conversation_id}      → thread list + open conversation
```

### Layout
Three-column, full viewport height below topbar:
- **Thread list** (320px) — scrollable, real-time
- **Conversation pane** (flex: 1) — message stream + composer
- **Customer rail** (320px) — context for active thread's customer

### Thread list
- Search bar — Postgres full-text search on customer name + message content
- Filter pills: All · Needs reply · New · Snoozed — maps directly to `conversations.status` values (`needs_reply`, `new`, `snoozed`); All shows every status
- Rows ordered by `last_message_at` DESC
- Each row: channel avatar + badge, customer name, snippet, timestamp, unread count or trust score pill, tags
- New conversation button for outbound-initiated threads

### Conversation pane
**Header**: customer name, channel chip, status badge, action buttons (Assign, Snooze, Resolve, Open customer)

**Message stream**:
- Inbound left-aligned, outbound right-aligned
- Channel tints: WhatsApp = green, Telegram = blue, Email = neutral
- Day separator pills
- Optimistic sends: appears immediately at reduced opacity, confirms on DB write
- Auto-scrolls to bottom on new message if already at bottom
- "↓ new messages" badge when scrolled up and new message arrives

**Composer**:
- Textarea: `Enter` to send, `Shift+Enter` for newline
- Quick reply chips above textarea (from `quick_replies` table, editable in settings)
- Send disabled when empty
- File/image attachment stubbed for v2

### Customer rail
- Avatar, name, handle, trust score
- LTV, last order date, channel
- Tags (with add/remove)
- Last 3 orders (stubbed in phase 1 — orders not yet built)
- Quick reply chips (same as composer)
- "Open →" navigates to `/customers/{customer_id}`

### Real-time subscriptions
Two active subscriptions while inbox is open:
1. `conversations` table (tenant-scoped) — updates thread list live
2. `messages` table filtered by active `conversation_id` — streams new messages

---

## What is explicitly out of scope for Phase 1

- Orders, payments, shipments, catalog
- Dashboard aggregations
- Broadcasts
- Automations
- Vault
- Reorder signals
- Trust score computation (manually set only)
- File/image attachments in messages
- Multi-user assignment workflows beyond basic `assigned_to`

These will be specced as separate phases once the Customer + Inbox foundation is stable.
