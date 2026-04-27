# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Peptech Next.js project, set up the multi-tenant Supabase schema with RLS, and wire up authentication — producing a working authenticated app before any feature work begins.

**Architecture:** Next.js 15 App Router + TypeScript on Vercel. Supabase for PostgreSQL, Auth, and real-time. All tables are tenant-scoped with Row Level Security enforced at the database level. A custom Auth Hook injects `tenant_id` into every JWT so RLS policies work without application-layer filtering.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL + Auth + SSR), Vitest, React Testing Library, @supabase/ssr

---

> ⚠️ **HARD STOP after Task 2.** The project will be scaffolded and CLAUDE.md will exist. The user must add their guidance to CLAUDE.md before any further work proceeds. Do not continue to Task 3 until the user confirms CLAUDE.md is complete.

---

## File Map

```
peptech/
├── CLAUDE.md                                   ← project guidance (user fills in)
├── .env.local                                  ← env vars (not committed)
├── .env.example                                ← committed template
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts
├── vitest.setup.ts
├── package.json
├── src/
│   ├── app/
│   │   ├── layout.tsx                          ← root layout, imports design CSS
│   │   ├── page.tsx                            ← redirects to /inbox
│   │   ├── login/
│   │   │   └── page.tsx                        ← login form
│   │   └── signup/
│   │       └── page.tsx                        ← tenant + user signup form
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts                       ← browser Supabase client
│   │       └── server.ts                       ← server Supabase client
│   ├── middleware.ts                           ← auth guard (Next.js middleware)
│   └── types/
│       └── database.ts                         ← generated from Supabase schema
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20260427000001_tenants_users.sql
│       ├── 20260427000002_customers.sql
│       ├── 20260427000003_conversations.sql
│       ├── 20260427000004_rls_policies.sql
│       └── 20260427000005_jwt_hook.sql
└── styles/
    └── peptech.css                             ← design system (copied from Claude Design)
```

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`, `.env.example`, `styles/peptech.css`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Create the Next.js app**

```bash
cd "c:/Users/alana/OneDrive/Documents/Pep Tech"
npx create-next-app@latest . --typescript --app --src-dir --no-tailwind --no-import-alias --eslint
```

When prompted: use App Router = yes, customise import alias = no.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Configure Vitest**

Replace `vitest.config.ts` with:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

Create `vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test script to package.json**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Copy the Peptech design CSS**

```bash
cp "Claude Design Files/project/peptech.css" styles/peptech.css
```

- [ ] **Step 6: Wire CSS into root layout**

Replace `src/app/layout.tsx` with:

```typescript
import type { Metadata } from 'next'
import '../../styles/peptech.css'

export const metadata: Metadata = {
  title: 'Peptech',
  description: 'Peptide business CRM',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Add root page redirect**

Replace `src/app/page.tsx` with:

```typescript
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/inbox')
}
```

- [ ] **Step 8: Create .env.example**

Create `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **Step 9: Verify it runs**

```bash
npm run dev
```

Expected: Next.js dev server starts on http://localhost:3000 with no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Peptech design system"
```

---

## Task 2: Create CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Create CLAUDE.md with project context**

Create `CLAUDE.md` at the project root:

```markdown
# Peptech — CLAUDE.md

## Project Overview
Peptech is a multi-tenant SaaS CRM for peptide dealers and suppliers.
Platform owner sells access to tenant businesses. Each tenant manages
their own customers, conversations, orders, and inventory.

## Stack
- Next.js 15 App Router + TypeScript
- Supabase (PostgreSQL + Auth + real-time)
- Deployed on Vercel + Supabase

## Design System
The Peptech CSS design system lives in `styles/peptech.css`.
All UI uses the `pt-*` class naming convention from that file.
Reference `Claude Design Files/project/` for component prototypes.
Do not introduce Tailwind or other CSS frameworks.

## Multi-tenancy Rules
- EVERY tenant-scoped table MUST have a `tenant_id uuid NOT NULL` column.
- EVERY tenant-scoped table MUST have an RLS policy.
- Never filter by tenant_id in application code — RLS handles it.
- Never return credentials from `tenant_channels` to the frontend.

## Testing
- Use Vitest + React Testing Library.
- Write the failing test before writing implementation code (TDD).
- Run `npm run test:run` before every commit.

## Commit Style
Conventional commits: feat:, fix:, chore:, test:, docs:

---

## User Guidance

[USER: ADD YOUR GUIDANCE HERE BEFORE DEVELOPMENT CONTINUES]
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md project guidance template"
```

---

> ⚠️ **HARD STOP — Do not proceed past this point until the user has added their guidance to CLAUDE.md and confirmed it is complete.**

---

## Task 3: Supabase local dev setup

**Files:**
- Create: `supabase/config.toml`, `.env.local`

- [ ] **Step 1: Install Supabase CLI**

```bash
npm install -D supabase
```

- [ ] **Step 2: Initialise Supabase**

```bash
npx supabase init
```

Expected: creates `supabase/config.toml` and `supabase/.gitignore`.

- [ ] **Step 3: Start local Supabase**

```bash
npx supabase start
```

Expected output includes local URLs and keys — note them. Takes ~60 seconds on first run.

- [ ] **Step 4: Create .env.local**

Using the values output from `supabase start`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start output>
```

- [ ] **Step 5: Add type generation script to package.json**

In `"scripts"`:

```json
"db:types": "supabase gen types typescript --local > src/types/database.ts"
```

- [ ] **Step 6: Commit**

```bash
git add supabase/ package.json
git commit -m "chore: add Supabase local dev setup"
```

---

## Task 4: Migration — tenants + users

**Files:**
- Create: `supabase/migrations/20260427000001_tenants_users.sql`

- [ ] **Step 1: Write the failing test**

Create `src/lib/supabase/__tests__/schema.test.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect } from 'vitest'

const supabase = createClient(
  'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

describe('tenants table', () => {
  it('rejects an invalid plan value', async () => {
    const { error } = await supabase
      .from('tenants')
      .insert({ name: 'Test', slug: 'test', plan: 'invalid' })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/check/)
  })
})

describe('users table', () => {
  it('rejects an invalid role value', async () => {
    const { error } = await supabase
      .from('users')
      .insert({ id: '00000000-0000-0000-0000-000000000001', tenant_id: '00000000-0000-0000-0000-000000000001', role: 'superadmin', email: 'x@x.com' })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/check/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/lib/supabase/__tests__/schema.test.ts
```

Expected: FAIL — tables do not exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260427000001_tenants_users.sql`:

```sql
create extension if not exists "pgcrypto";

-- shared updated_at trigger function (used by all tables)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.tenants (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  slug       text        not null unique,
  plan       text        not null default 'starter'
               check (plan in ('starter','pro','enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create table public.users (
  id           uuid        primary key references auth.users(id) on delete cascade,
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  role         text        not null default 'member'
                 check (role in ('owner','admin','member')),
  display_name text,
  email        text        not null,
  created_at   timestamptz not null default now()
);
```

- [ ] **Step 4: Apply the migration**

```bash
npx supabase db reset
```

Expected: migration applies cleanly with no errors.

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:run -- src/lib/supabase/__tests__/schema.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260427000001_tenants_users.sql src/lib/supabase/__tests__/schema.test.ts
git commit -m "feat: add tenants and users migration"
```

---

## Task 5: Migration — customers

**Files:**
- Create: `supabase/migrations/20260427000002_customers.sql`
- Modify: `src/lib/supabase/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/supabase/__tests__/schema.test.ts`:

```typescript
describe('customer_channels table', () => {
  it('rejects duplicate channel+identifier per tenant', async () => {
    // Insert a tenant first using service role (bypasses RLS)
    const { data: tenant } = await supabase
      .from('tenants')
      .insert({ name: 'T1', slug: `t1-${Date.now()}` })
      .select()
      .single()

    const { data: customer } = await supabase
      .from('customers')
      .insert({ tenant_id: tenant!.id, display_name: 'Alice' })
      .select()
      .single()

    await supabase.from('customer_channels').insert({
      tenant_id: tenant!.id,
      customer_id: customer!.id,
      channel_type: 'whatsapp',
      identifier: '+15005550001',
      display_handle: '+1 500 555 0001',
    })

    const { error } = await supabase.from('customer_channels').insert({
      tenant_id: tenant!.id,
      customer_id: customer!.id,
      channel_type: 'whatsapp',
      identifier: '+15005550001',
      display_handle: '+1 500 555 0001',
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/unique/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/lib/supabase/__tests__/schema.test.ts
```

Expected: FAIL — tables do not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260427000002_customers.sql`:

```sql
create table public.customers (
  id           uuid          primary key default gen_random_uuid(),
  tenant_id    uuid          not null references public.tenants(id) on delete cascade,
  display_name text          not null,
  trust_score  int           not null default 50
                 check (trust_score between 0 and 100),
  ltv          numeric(10,2) not null default 0,
  notes        text,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create table public.customer_channels (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  customer_id    uuid        not null references public.customers(id) on delete cascade,
  channel_type   text        not null
                   check (channel_type in ('whatsapp','telegram','email')),
  identifier     text        not null,
  display_handle text        not null,
  is_primary     bool        not null default false,
  created_at     timestamptz not null default now(),
  unique (tenant_id, channel_type, identifier)
);

create table public.customer_tags (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  customer_id uuid        not null references public.customers(id) on delete cascade,
  tag         text        not null,
  created_at  timestamptz not null default now(),
  unique (customer_id, tag)
);
```

- [ ] **Step 4: Apply and run tests**

```bash
npx supabase db reset && npm run test:run -- src/lib/supabase/__tests__/schema.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260427000002_customers.sql src/lib/supabase/__tests__/schema.test.ts
git commit -m "feat: add customers, customer_channels, customer_tags migration"
```

---

## Task 6: Migration — conversations, messages, notes, quick_replies, tenant_channels

**Files:**
- Create: `supabase/migrations/20260427000003_conversations.sql`
- Modify: `src/lib/supabase/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/supabase/__tests__/schema.test.ts`:

```typescript
describe('messages table', () => {
  it('rejects duplicate external_id per tenant', async () => {
    const { data: tenant } = await supabase
      .from('tenants')
      .insert({ name: 'T2', slug: `t2-${Date.now()}` })
      .select().single()

    const { data: customer } = await supabase
      .from('customers')
      .insert({ tenant_id: tenant!.id, display_name: 'Bob' })
      .select().single()

    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenant!.id,
        customer_id: customer!.id,
        channel_type: 'telegram',
        channel_identifier: '@bob',
      })
      .select().single()

    await supabase.from('messages').insert({
      tenant_id: tenant!.id,
      conversation_id: conv!.id,
      direction: 'inbound',
      content: 'hello',
      external_id: 'msg-001',
    })

    const { error } = await supabase.from('messages').insert({
      tenant_id: tenant!.id,
      conversation_id: conv!.id,
      direction: 'inbound',
      content: 'hello again',
      external_id: 'msg-001',
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/unique/)
  })

  it('rejects invalid status', async () => {
    const { data: tenant } = await supabase
      .from('tenants')
      .insert({ name: 'T3', slug: `t3-${Date.now()}` })
      .select().single()

    const { data: customer } = await supabase
      .from('customers')
      .insert({ tenant_id: tenant!.id, display_name: 'Carl' })
      .select().single()

    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenant!.id,
        customer_id: customer!.id,
        channel_type: 'email',
        channel_identifier: 'carl@example.com',
      })
      .select().single()

    const { error } = await supabase.from('messages').insert({
      tenant_id: tenant!.id,
      conversation_id: conv!.id,
      direction: 'inbound',
      content: 'test',
      status: 'bounced',
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/check/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/lib/supabase/__tests__/schema.test.ts
```

Expected: FAIL — tables do not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260427000003_conversations.sql`:

```sql
create table public.tenant_channels (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  channel_type   text        not null
                   check (channel_type in ('whatsapp','telegram','email')),
  identifier     text        not null,
  credentials    jsonb,
  webhook_secret text,
  is_active      bool        not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, channel_type)
);

create trigger tenant_channels_updated_at
  before update on public.tenant_channels
  for each row execute function public.set_updated_at();

create table public.conversations (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  customer_id          uuid        not null references public.customers(id) on delete cascade,
  channel_type         text        not null
                         check (channel_type in ('whatsapp','telegram','email')),
  channel_identifier   text        not null,
  status               text        not null default 'new'
                         check (status in ('new','needs_reply','in_progress','resolved','snoozed')),
  unread_count         int         not null default 0,
  last_message_at      timestamptz,
  last_message_snippet text,
  assigned_to          uuid        references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  direction       text        not null check (direction in ('inbound','outbound')),
  content         text        not null,
  sent_at         timestamptz not null default now(),
  status          text        not null default 'sent'
                    check (status in ('sending','sent','delivered','read','failed')),
  external_id     text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create unique index messages_external_id_unique
  on public.messages (tenant_id, external_id)
  where external_id is not null;

create table public.notes (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  customer_id uuid        not null references public.customers(id) on delete cascade,
  content     text        not null,
  created_by  uuid        references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.quick_replies (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  label      text        not null,
  content    text        not null,
  sort_order int         not null default 0,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 4: Apply and run tests**

```bash
npx supabase db reset && npm run test:run -- src/lib/supabase/__tests__/schema.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260427000003_conversations.sql src/lib/supabase/__tests__/schema.test.ts
git commit -m "feat: add conversations, messages, notes, quick_replies, tenant_channels migration"
```

---

## Task 7: RLS policies

**Files:**
- Create: `supabase/migrations/20260427000004_rls_policies.sql`
- Modify: `src/lib/supabase/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/supabase/__tests__/schema.test.ts`:

```typescript
describe('RLS tenant isolation', () => {
  it('anon client cannot read customers', async () => {
    const anonClient = createClient(
      'http://127.0.0.1:54321',
      // anon key (public)
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7kyqHDCc032GzmtkiDYv4qoBIG8Fd8SVFbU'
    )
    const { data, error } = await anonClient.from('customers').select('*')
    // RLS should return empty array (not an error, but no rows)
    expect(data).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/lib/supabase/__tests__/schema.test.ts
```

Expected: FAIL — RLS not yet enabled, anon can read rows.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260427000004_rls_policies.sql`:

```sql
-- Helper: extract tenant_id from JWT claims
create or replace function public.auth_tenant_id()
returns uuid language sql stable as $$
  select (auth.jwt() ->> 'tenant_id')::uuid;
$$;

-- Enable RLS on all tables
alter table public.tenants          enable row level security;
alter table public.users            enable row level security;
alter table public.tenant_channels  enable row level security;
alter table public.customers        enable row level security;
alter table public.customer_channels enable row level security;
alter table public.customer_tags    enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.notes            enable row level security;
alter table public.quick_replies    enable row level security;

-- Users: each user sees only their own row
create policy "users_own_row" on public.users
  for all using (id = auth.uid());

-- Tenants: user sees only their own tenant
create policy "tenants_own" on public.tenants
  for all using (id = public.auth_tenant_id());

-- All tenant-scoped tables: isolate by tenant_id
create policy "tenant_isolation" on public.tenant_channels
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.customers
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.customer_channels
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.customer_tags
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.conversations
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.messages
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.notes
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.quick_replies
  for all using (tenant_id = public.auth_tenant_id());
```

- [ ] **Step 4: Apply and run tests**

```bash
npx supabase db reset && npm run test:run -- src/lib/supabase/__tests__/schema.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260427000004_rls_policies.sql src/lib/supabase/__tests__/schema.test.ts
git commit -m "feat: add RLS policies for tenant isolation"
```

---

## Task 8: JWT custom claims hook

**Files:**
- Create: `supabase/migrations/20260427000005_jwt_hook.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260427000005_jwt_hook.sql`:

```sql
-- Auth hook: injects tenant_id into every JWT
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims    jsonb;
  tenant_id uuid;
begin
  select u.tenant_id into tenant_id
  from public.users u
  where u.id = (event ->> 'userId')::uuid;

  claims := event -> 'claims';

  if tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tenant_id::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon;
```

- [ ] **Step 2: Register the hook in config.toml**

Open `supabase/config.toml` and add inside `[auth]`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

- [ ] **Step 3: Apply migration**

```bash
npx supabase db reset
```

Expected: migration applies cleanly.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260427000005_jwt_hook.sql supabase/config.toml
git commit -m "feat: add JWT custom claims hook to inject tenant_id"
```

---

## Task 9: Supabase TypeScript types + client setup

**Files:**
- Create: `src/types/database.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`

- [ ] **Step 1: Generate TypeScript types**

```bash
npm run db:types
```

Expected: `src/types/database.ts` is created with typed schema.

- [ ] **Step 2: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Create server Supabase client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )
}
```

- [ ] **Step 4: Write a client smoke test**

Create `src/lib/supabase/__tests__/client.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createClient } from '../client'

describe('createClient', () => {
  it('creates a client without throwing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'
    expect(() => createClient()).not.toThrow()
  })
})
```

- [ ] **Step 5: Run test**

```bash
npm run test:run -- src/lib/supabase/__tests__/client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/lib/supabase/client.ts src/lib/supabase/server.ts src/lib/supabase/__tests__/client.test.ts
git commit -m "feat: add Supabase typed clients (browser + server)"
```

---

## Task 10: Auth middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write the failing test**

Create `src/middleware.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Middleware is tested via integration — verify the protected paths
describe('auth middleware config', () => {
  it('matches app routes but not static assets', async () => {
    const { config } = await import('./middleware')
    const pattern = new RegExp(config.matcher[0])
    expect(pattern.test('/_next/static/chunk.js')).toBe(false)
    expect(pattern.test('/inbox')).toBe(true)
    expect(pattern.test('/api/send')).toBe(true)
    // webhook routes are public — no auth required
    expect(pattern.test('/api/webhooks/whatsapp/123')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/middleware.test.ts
```

Expected: FAIL — middleware does not exist.

- [ ] **Step 3: Create the middleware**

Create `src/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup', '/api/webhooks']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublic = PUBLIC_PATHS.some(p =>
    request.nextUrl.pathname.startsWith(p))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Run test**

```bash
npm run test:run -- src/middleware.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/middleware.test.ts
git commit -m "feat: add auth middleware — redirect unauthenticated to /login"
```

---

## Task 11: Login page

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`

- [ ] **Step 1: Create server action for login**

Create `src/app/login/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return redirect('/login?error=Invalid+credentials')
  }

  redirect('/inbox')
}
```

- [ ] **Step 2: Create login page**

Create `src/app/login/page.tsx`:

```typescript
import { loginAction } from './actions'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  return (
    <div className="pt-root no-right" style={{ placeItems: 'center', display: 'grid' }}>
      <div style={{ width: 360 }}>
        <div className="pt-brand" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <div className="pt-brand-mark">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path d="M3 10.5 7 5.5h6l4 5-4 5H7l-4-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="10" cy="10.5" r="2" fill="currentColor"/>
            </svg>
          </div>
          <div className="pt-brand-name">Peptech<span>.</span></div>
        </div>

        {searchParams.error && (
          <div style={{ color: 'var(--pt-danger)', fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
            {searchParams.error}
          </div>
        )}

        <form action={loginAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            style={{
              height: 36, padding: '0 12px', borderRadius: 'var(--pt-radius)',
              border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
              font: 'inherit', fontSize: 13, color: 'var(--pt-fg)', outline: 'none',
            }}
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            style={{
              height: 36, padding: '0 12px', borderRadius: 'var(--pt-radius)',
              border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
              font: 'inherit', fontSize: 13, color: 'var(--pt-fg)', outline: 'none',
            }}
          />
          <button type="submit" className="pt-btn pt-btn-primary" style={{ height: 36, justifyContent: 'center' }}>
            Sign in
          </button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--pt-fg-3)', textAlign: 'center', marginTop: 16 }}>
          No account? <a href="/signup" style={{ color: 'var(--pt-accent-fg)' }}>Sign up</a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify dev server renders login**

```bash
npm run dev
```

Navigate to http://localhost:3000/login — expect the Peptech login form with correct design tokens (no Tailwind classes, uses `pt-*` styles).

- [ ] **Step 4: Commit**

```bash
git add src/app/login/
git commit -m "feat: add login page with Supabase auth action"
```

---

## Task 12: Tenant signup

**Files:**
- Create: `src/app/signup/page.tsx`, `src/app/signup/actions.ts`

- [ ] **Step 1: Create server action for signup**

Create `src/app/signup/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { redirect } from 'next/navigation'

export async function signupAction(formData: FormData) {
  const businessName = formData.get('businessName') as string
  const email        = formData.get('email') as string
  const password     = formData.get('password') as string

  // Use service role to create tenant + user rows (bypasses RLS)
  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Create auth user
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return redirect(`/signup?error=${encodeURIComponent(authError?.message ?? 'Signup failed')}`)
  }

  // 2. Create tenant
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  const { data: tenant, error: tenantError } = await service
    .from('tenants')
    .insert({ name: businessName, slug: `${slug}-${Date.now()}` })
    .select()
    .single()

  if (tenantError || !tenant) {
    return redirect(`/signup?error=Could+not+create+workspace`)
  }

  // 3. Create user record
  await service.from('users').insert({
    id: authData.user.id,
    tenant_id: tenant.id,
    role: 'owner',
    email,
    display_name: email.split('@')[0],
  })

  // 4. Sign them in
  const supabase = await createClient()
  await supabase.auth.signInWithPassword({ email, password })

  redirect('/inbox')
}
```

- [ ] **Step 2: Create signup page**

Create `src/app/signup/page.tsx`:

```typescript
import { signupAction } from './actions'

export default function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  return (
    <div className="pt-root no-right" style={{ placeItems: 'center', display: 'grid' }}>
      <div style={{ width: 360 }}>
        <div className="pt-brand" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <div className="pt-brand-mark">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path d="M3 10.5 7 5.5h6l4 5-4 5H7l-4-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="10" cy="10.5" r="2" fill="currentColor"/>
            </svg>
          </div>
          <div className="pt-brand-name">Peptech<span>.</span></div>
        </div>

        {searchParams.error && (
          <div style={{ color: 'var(--pt-danger)', fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
            {searchParams.error}
          </div>
        )}

        <form action={signupAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            name="businessName"
            type="text"
            placeholder="Business name"
            required
            style={{
              height: 36, padding: '0 12px', borderRadius: 'var(--pt-radius)',
              border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
              font: 'inherit', fontSize: 13, color: 'var(--pt-fg)', outline: 'none',
            }}
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            style={{
              height: 36, padding: '0 12px', borderRadius: 'var(--pt-radius)',
              border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
              font: 'inherit', fontSize: 13, color: 'var(--pt-fg)', outline: 'none',
            }}
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            minLength={8}
            style={{
              height: 36, padding: '0 12px', borderRadius: 'var(--pt-radius)',
              border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
              font: 'inherit', fontSize: 13, color: 'var(--pt-fg)', outline: 'none',
            }}
          />
          <button type="submit" className="pt-btn pt-btn-primary" style={{ height: 36, justifyContent: 'center' }}>
            Create workspace
          </button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--pt-fg-3)', textAlign: 'center', marginTop: 16 }}>
          Already have an account? <a href="/login" style={{ color: 'var(--pt-accent-fg)' }}>Sign in</a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
npm run test:run
```

Expected: all tests PASS.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

1. Navigate to http://localhost:3000/signup
2. Fill in business name, email, password
3. Submit — expect redirect to /inbox (which will be empty for now)
4. Navigate to http://localhost:3000/login, sign out, sign back in — expect redirect to /inbox

- [ ] **Step 5: Commit**

```bash
git add src/app/signup/
git commit -m "feat: add tenant signup flow — creates tenant + owner user"
```

---

## What's next

Plan 1 is complete. The project now has:
- Correct multi-tenant PostgreSQL schema with check constraints
- RLS isolating every tenant's data at the DB level
- JWT custom claims hook injecting `tenant_id` into every session
- Auth middleware protecting all routes except `/login`, `/signup`, and `/api/webhooks`
- Working login + tenant signup

**Plan 2** covers: WhatsApp/Telegram/Email channel integrations (webhooks + outbound send), Customers UI, and the full Inbox UI.
