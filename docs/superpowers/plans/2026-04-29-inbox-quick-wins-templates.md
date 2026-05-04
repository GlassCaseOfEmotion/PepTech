# Inbox Quick Wins + Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the inaccurate "e2e encrypted" label, add a channel filter to the inbox thread list, and build a full message templates feature (platform + tenant, copy-on-edit) with a settings page and composer picker.

**Architecture:** Templates use a single `templates` table where `tenant_id IS NULL` means platform-owned and `tenant_id IS NOT NULL` means tenant-owned. When a tenant edits a platform template, the UI creates a tenant copy and calls `hide_platform_template()` (a SECURITY DEFINER function) to hide the original for that tenant. Templates are fetched server-side on the inbox page and passed through InboxProvider to the composer's TemplatePicker component.

**Tech Stack:** Next.js 15 App Router, Supabase (RLS + SECURITY DEFINER function), Vitest

---

## File Structure

```
supabase/migrations/
  20260429000006_templates.sql          NEW — table, RLS, hide function, platform seeds

src/app/inbox/
  page.tsx                              MODIFY — add templates fetch alongside conversations

src/components/inbox/
  InboxProvider.tsx                     MODIFY — add templates to context type + props
  InboxView.tsx                         MODIFY — (1) remove e2e label (2) channel filter (3) wire TemplatePicker
  TemplatePicker.tsx                    NEW — searchable template list panel component

src/app/settings/templates/
  page.tsx                              NEW — server component, lists + manages templates
  actions.ts                            NEW — server actions: create, update (copy-on-edit), delete

src/components/settings/
  SettingsNav.tsx                       MODIFY — mark templates as built: true
```

---

## Task 1: Remove "e2e encrypted" label + channel filter

**Files:**
- Modify: `src/components/inbox/InboxView.tsx`

This task has two changes to the same file — do them together.

### 1a — Remove e2e encrypted

The label is in the ConversationPane header at line ~325:
```tsx
<span><i className="pt-dot pt-dot-ok" /> e2e encrypted</span>
```
Delete that entire `<span>` element and the `<span className="pt-dot pt-dot-cool" />` separator immediately before it.

### 1b — Channel filter

Add a channel filter row below the existing status filter pills in `ThreadColumn`. The component already has `filter`/`setFilter` for status. Add a new `chanFilter`/`setChanFilter` state (values: `'all' | 'wa' | 'tg' | 'em'`) inside `ThreadColumn`.

Update `visible` to also filter by channel:
```typescript
const visible = threads.filter(t => {
  if (filter === 'all') { if (t.status === 'resolved') return false }
  else if (t.status !== filter) return false
  if (chanFilter !== 'all' && t.channel !== chanFilter) return false
  if (search) {
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.handle.toLowerCase().includes(q)
  }
  return true
})
```

Add the channel filter row after the existing `pt-ix-filters` div:
```tsx
<div className="pt-ix-filters pt-ix-chan-filters">
  {(['all', 'wa', 'tg', 'em'] as const).map(ch => (
    <button
      key={ch}
      className={`pt-pill ${chanFilter === ch ? 'is-on' : ''}`}
      onClick={() => setChanFilter(ch)}
    >
      {ch === 'all' ? 'All channels' : ch === 'wa' ? 'WhatsApp' : ch === 'tg' ? 'Telegram' : 'Email'}
    </button>
  ))}
</div>
```

- [ ] **Step 1: Remove e2e encrypted label**

In `src/components/inbox/InboxView.tsx`, find and delete these two lines (~lines 322-325):
```tsx
              <span className="pt-dot pt-dot-cool" />
              <span><i className="pt-dot pt-dot-ok" /> e2e encrypted</span>
```

- [ ] **Step 2: Add channel filter state and updated visible filter**

In `ThreadColumn`, add after `const [search, setSearch] = useState('')`:
```typescript
const [chanFilter, setChanFilter] = useState<'all' | 'wa' | 'tg' | 'em'>('all')
```

Replace the `visible` filter block with:
```typescript
const visible = threads.filter(t => {
  if (filter === 'all') { if (t.status === 'resolved') return false }
  else if (t.status !== filter) return false
  if (chanFilter !== 'all' && t.channel !== chanFilter) return false
  if (search) {
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.handle.toLowerCase().includes(q)
  }
  return true
})
```

- [ ] **Step 3: Add channel filter row to JSX**

In `ThreadColumn`'s return, after the `<div className="pt-ix-filters">` block (the status pills), add:
```tsx
<div className="pt-ix-filters pt-ix-chan-filters">
  {(['all', 'wa', 'tg', 'em'] as const).map(ch => (
    <button
      key={ch}
      className={`pt-pill ${chanFilter === ch ? 'is-on' : ''}`}
      onClick={() => setChanFilter(ch)}
    >
      {ch === 'all' ? 'All channels' : ch === 'wa' ? 'WhatsApp' : ch === 'tg' ? 'Telegram' : 'Email'}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Run tests**

```bash
cd "c:\Users\alana\OneDrive\Documents\Pep Tech"
npm run test:run
```
Expected: all 65 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/InboxView.tsx
git commit -m "feat: remove e2e encrypted label, add channel filter to inbox"
```

---

## Task 2: Templates DB migration

**Files:**
- Create: `supabase/migrations/20260429000006_templates.sql`

Apply via `mcp__supabase__apply_migration` then create the local file.

- [ ] **Step 1: Apply migration**

Use `mcp__supabase__apply_migration` with name `templates` and this SQL:

```sql
CREATE TABLE public.templates (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  content         text        NOT NULL,
  sort_order      int         NOT NULL DEFAULT 0,
  hidden_by_tenants uuid[]    NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- tenant_id IS NULL  = platform template (visible to all unless hidden)
-- tenant_id IS NOT NULL = tenant-owned template

CREATE INDEX templates_tenant_idx ON public.templates (tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- SELECT: own templates OR platform templates not hidden for this tenant
CREATE POLICY templates_select ON public.templates FOR SELECT USING (
  tenant_id = auth_tenant_id()
  OR (
    tenant_id IS NULL
    AND auth_tenant_id() IS NOT NULL
    AND NOT (auth_tenant_id() = ANY(hidden_by_tenants))
  )
);

-- INSERT/UPDATE/DELETE: only own tenant rows
CREATE POLICY templates_write ON public.templates
  FOR ALL
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- SECURITY DEFINER function so tenants can hide a platform template
-- (they can't UPDATE platform rows directly due to RLS)
CREATE OR REPLACE FUNCTION public.hide_platform_template(template_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.templates
  SET hidden_by_tenants = array_append(hidden_by_tenants, auth_tenant_id())
  WHERE id = template_id
    AND tenant_id IS NULL
    AND NOT (auth_tenant_id() = ANY(hidden_by_tenants));
$$;

-- Platform seed templates (tenant_id = NULL)
INSERT INTO public.templates (tenant_id, title, content, sort_order) VALUES
(NULL, 'Payment received',    'Thanks for your payment of $[AMOUNT]! Your order is being prepared and will be dispatched shortly.', 10),
(NULL, 'Order dispatched',    'Great news — your order has been dispatched! You''ll receive tracking info shortly.', 20),
(NULL, 'Tracking info',       'Your tracking number is [TRACKING]. You can use this to follow your shipment.', 30),
(NULL, 'Out of stock',        'Unfortunately [PRODUCT] is currently out of stock. We expect to restock within [TIMEFRAME] and will let you know as soon as it''s available.', 40),
(NULL, 'Order confirmed',     'Your order is confirmed! Total: $[AMOUNT]. We''ll update you once it''s on its way.', 50),
(NULL, 'Follow up',           'Hi [NAME], just checking in — is there anything else I can help you with?', 60);
```

- [ ] **Step 2: Verify migration**

Use `mcp__supabase__execute_sql`:
```sql
SELECT id, title, sort_order FROM public.templates ORDER BY sort_order;
```
Expected: 6 rows with platform templates.

- [ ] **Step 3: Create local migration file**

Create `supabase/migrations/20260429000006_templates.sql` with the same SQL from Step 1.

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```
Expected: all 65 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260429000006_templates.sql
git commit -m "feat: add templates table with RLS, hide function, and platform seeds"
```

---

## Task 3: Templates type + inbox page fetch

**Files:**
- Modify: `src/app/inbox/page.tsx`
- Modify: `src/components/inbox/InboxProvider.tsx`

Add a `DbTemplate` type and thread templates through to InboxProvider context.

### DbTemplate type

Add to `src/types/inbox.ts` after `DbNote`:
```typescript
export type DbTemplate = {
  id: string
  tenant_id: string | null
  title: string
  content: string
  sort_order: number
}
```

### Inbox page fetch

In `src/app/inbox/page.tsx`, add a third parallel fetch for templates:
```typescript
const [{ data: conversations }, { data: quickReplies }, { data: templates }] = await Promise.all([
  supabase.from('conversations').select(`...`).in('status', [...]).order(...),
  supabase.from('quick_replies').select('id, label, content, sort_order').order('sort_order'),
  supabase.from('templates').select('id, tenant_id, title, content, sort_order').order('sort_order'),
])
```

Pass to InboxView:
```tsx
<InboxView
  initialConversations={...}
  quickReplies={...}
  templates={(templates ?? []) as DbTemplate[]}
/>
```

### InboxProvider changes

Add to `InboxCtx`:
```typescript
templates: DbTemplate[]
```

Add to `InboxProvider` props interface:
```typescript
templates: DbTemplate[]
```

Pass through to context value.

- [ ] **Step 1: Add DbTemplate type to src/types/inbox.ts**

After the `DbNote` type definition, add:
```typescript
export type DbTemplate = {
  id: string
  tenant_id: string | null
  title: string
  content: string
  sort_order: number
}
```

- [ ] **Step 2: Update inbox page.tsx**

Read the current file, then replace the `Promise.all` and return:

```typescript
import type { DbConversation, DbQuickReply, DbTemplate } from '@/types/inbox'

// Inside the page function:
const [{ data: conversations }, { data: quickReplies }, { data: templates }] = await Promise.all([
  supabase
    .from('conversations')
    .select(`
      id, status, unread_count, last_message_at, last_message_snippet,
      channel_type, channel_identifier,
      customers (
        id, display_name, trust_score, ltv,
        customer_tags (tag),
        customer_channels (channel_type, display_handle, is_primary)
      )
    `)
    .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
    .order('last_message_at', { ascending: false, nullsFirst: false }),
  supabase
    .from('quick_replies')
    .select('id, label, content, sort_order')
    .order('sort_order'),
  supabase
    .from('templates')
    .select('id, tenant_id, title, content, sort_order')
    .order('sort_order'),
])

return (
  <InboxView
    initialConversations={(conversations ?? []) as DbConversation[]}
    quickReplies={(quickReplies ?? []) as DbQuickReply[]}
    templates={(templates ?? []) as DbTemplate[]}
  />
)
```

- [ ] **Step 3: Update InboxProvider context type and props**

In `src/components/inbox/InboxProvider.tsx`:

Add `templates: DbTemplate[]` to the `InboxCtx` type.

Add `DbTemplate` to the import from `@/types/inbox`.

Add `templates: DbTemplate[]` to the `Props` interface.

Add `templates` to the `InboxContext.Provider value` object.

- [ ] **Step 4: Update InboxView to accept and forward templates**

In `src/components/inbox/InboxView.tsx`:

Add `DbTemplate` to the import from `@/types/inbox`.

Add `templates: DbTemplate[]` to `InboxViewProps`.

Pass `templates` to `<InboxProvider templates={templates} ...>`.

- [ ] **Step 5: Run tests**

```bash
npm run test:run
```
Expected: all 65 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/inbox.ts src/app/inbox/page.tsx src/components/inbox/InboxProvider.tsx src/components/inbox/InboxView.tsx
git commit -m "feat: thread templates through inbox page → InboxProvider context"
```

---

## Task 4: TemplatePicker component + wire composer button

**Files:**
- Create: `src/components/inbox/TemplatePicker.tsx`
- Modify: `src/components/inbox/InboxView.tsx` (Composer function)

The `{{ template }}` button in the Composer currently does nothing. Clicking it should toggle a panel above the composer that lists all templates (platform + tenant) with a search input. Clicking a template inserts its content into the draft.

### TemplatePicker component

```tsx
'use client'

import { useState } from 'react'
import type { DbTemplate } from '@/types/inbox'

interface Props {
  templates: DbTemplate[]
  onSelect: (content: string) => void
  onClose: () => void
}

export function TemplatePicker({ templates, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('')
  const filtered = templates.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.content.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="pt-tpl-picker">
      <div className="pt-tpl-search">
        <input
          autoFocus
          placeholder="Search templates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="pt-tpl-close" onClick={onClose}>✕</button>
      </div>
      <ul className="pt-tpl-list">
        {filtered.map(t => (
          <li key={t.id} className="pt-tpl-item" onClick={() => { onSelect(t.content); onClose() }}>
            <div className="pt-tpl-title">{t.title}</div>
            <div className="pt-tpl-preview">{t.content.slice(0, 80)}{t.content.length > 80 ? '…' : ''}</div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="pt-tpl-empty">No templates match "{search}"</li>
        )}
      </ul>
    </div>
  )
}
```

### Composer update

In the `Composer` function in `InboxView.tsx`, add:
- `const { quickReplies, templates } = useInbox()`
- `const [showTemplates, setShowTemplates] = useState(false)`

Import `TemplatePicker`.

Replace the `{{ template }}` button:
```tsx
<button
  className={`pt-tag pt-tag-soft ${showTemplates ? 'is-on' : ''}`}
  onClick={() => setShowTemplates(v => !v)}
>{'{{ template }}'}</button>
```

Add the picker above the composer field (inside `pt-ix-composer`, before `pt-composer-field`):
```tsx
{showTemplates && (
  <TemplatePicker
    templates={templates}
    onSelect={content => setDraft(d => d ? `${d}\n\n${content}` : content)}
    onClose={() => setShowTemplates(false)}
  />
)}
```

- [ ] **Step 1: Create TemplatePicker component**

Create `src/components/inbox/TemplatePicker.tsx` with this content:

```tsx
'use client'

import { useState } from 'react'
import type { DbTemplate } from '@/types/inbox'

interface Props {
  templates: DbTemplate[]
  onSelect: (content: string) => void
  onClose: () => void
}

export function TemplatePicker({ templates, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('')
  const filtered = templates.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.content.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="pt-tpl-picker">
      <div className="pt-tpl-search">
        <input
          autoFocus
          placeholder="Search templates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="pt-tpl-close" onClick={onClose}>✕</button>
      </div>
      <ul className="pt-tpl-list">
        {filtered.map(t => (
          <li key={t.id} className="pt-tpl-item" onClick={() => { onSelect(t.content); onClose() }}>
            <div className="pt-tpl-title">{t.title}</div>
            <div className="pt-tpl-preview">{t.content.slice(0, 80)}{t.content.length > 80 ? '…' : ''}</div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="pt-tpl-empty">No templates match &ldquo;{search}&rdquo;</li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Update Composer in InboxView.tsx**

Find the `Composer` function. Make these changes:

1. Change: `const { quickReplies } = useInbox()` → `const { quickReplies, templates } = useInbox()`
2. Add state: `const [showTemplates, setShowTemplates] = useState(false)`
3. Add import at top of file: `import { TemplatePicker } from './TemplatePicker'`
4. Replace the `{{ template }}` button:
```tsx
<button
  className={`pt-tag pt-tag-soft ${showTemplates ? 'is-on' : ''}`}
  title="Templates"
  onClick={() => setShowTemplates(v => !v)}
>{'{{ template }}'}</button>
```
5. In the return, inside `<div className="pt-ix-composer">`, add before `<div className="pt-composer-field">`:
```tsx
{showTemplates && (
  <TemplatePicker
    templates={templates}
    onSelect={content => { setDraft(d => d ? `${d}\n\n${content}` : content); setTimeout(() => taRef.current?.focus(), 0) }}
    onClose={() => setShowTemplates(false)}
  />
)}
```

- [ ] **Step 3: Add CSS to styles/inbox.css**

Add after the `.pt-note-actions` rule:

```css
/* ── Template picker ─────────────────────────────────────────────────────── */
.pt-tpl-picker {
  border-top: 0.5px solid var(--pt-line);
  background: var(--pt-bg-side);
  max-height: 220px; display: flex; flex-direction: column;
}
.pt-tpl-search {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 0.5px solid var(--pt-line);
}
.pt-tpl-search input {
  flex: 1; background: none; border: none; outline: none;
  font: inherit; font-size: 12.5px; color: var(--pt-fg);
}
.pt-tpl-close {
  background: none; border: none; color: var(--pt-fg-4);
  cursor: pointer; font-size: 12px; padding: 0 2px;
}
.pt-tpl-close:hover { color: var(--pt-fg); }
.pt-tpl-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.pt-tpl-item {
  padding: 8px 14px; cursor: pointer; border-bottom: 0.5px solid var(--pt-line-soft);
}
.pt-tpl-item:hover { background: oklch(from var(--pt-fg) l c h / 0.04); }
.pt-tpl-title { font-size: 12px; font-weight: 500; color: var(--pt-fg); margin-bottom: 2px; }
.pt-tpl-preview { font-size: 11px; color: var(--pt-fg-4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-tpl-empty { padding: 12px 14px; font-size: 12px; color: var(--pt-fg-4); }
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```
Expected: all 65 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/TemplatePicker.tsx src/components/inbox/InboxView.tsx styles/inbox.css
git commit -m "feat: template picker in inbox composer"
```

---

## Task 5: Templates settings page

**Files:**
- Create: `src/app/settings/templates/page.tsx`
- Create: `src/app/settings/templates/actions.ts`
- Modify: `src/components/settings/SettingsNav.tsx`

Tenants can:
- See all templates (platform + own)
- Add a new template
- Edit a template (if platform → creates copy + hides original; if own → updates directly)
- Delete their own templates (platform templates cannot be deleted, only hidden via copy-on-edit)

Platform templates show a "Customise" button. Own templates show "Edit" and "Delete".

### actions.ts

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createTemplate(formData: FormData) {
  const title = (formData.get('title') as string)?.trim()
  const content = (formData.get('content') as string)?.trim()
  if (!title || !content) return { error: 'Title and content are required' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  await supabase.from('templates').insert({
    tenant_id: userRow.tenant_id,
    title,
    content,
    sort_order: Date.now(),
  })
  revalidatePath('/settings/templates')
  return { success: true }
}

export async function updateTemplate(formData: FormData) {
  const id = (formData.get('id') as string)?.trim()
  const title = (formData.get('title') as string)?.trim()
  const content = (formData.get('content') as string)?.trim()
  const isPlatform = formData.get('isPlatform') === 'true'
  if (!id || !title || !content) return { error: 'Missing fields' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  if (isPlatform) {
    // Copy-on-edit: create tenant copy and hide platform original
    await supabase.from('templates').insert({
      tenant_id: userRow.tenant_id,
      title,
      content,
      sort_order: Date.now(),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('hide_platform_template', { template_id: id })
  } else {
    await supabase.from('templates').update({ title, content }).eq('id', id)
  }
  revalidatePath('/settings/templates')
  return { success: true }
}

export async function deleteTemplate(formData: FormData) {
  const id = (formData.get('id') as string)?.trim()
  if (!id) return { error: 'Missing id' }

  const supabase = await createClient()
  await supabase.from('templates').delete().eq('id', id)
  revalidatePath('/settings/templates')
  return { success: true }
}
```

### page.tsx

The page is a server component that lists templates in two groups:
- "Platform templates" (tenant_id IS NULL in the result — these have isPlatform=true)
- "Your templates" (tenant_id not null)

It uses an inline edit form approach: each template row has an expand/collapse form when editing.

```tsx
import { createClient } from '@/lib/supabase/server'
import { createTemplate, updateTemplate, deleteTemplate } from './actions'

const taStyle = {
  width: '100%', boxSizing: 'border-box' as const,
  background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)',
  borderRadius: 6, padding: '7px 9px', font: 'inherit', fontSize: 12.5,
  color: 'var(--pt-fg)', resize: 'vertical' as const, outline: 'none', lineHeight: 1.45,
}
const inputStyle = {
  height: 32, padding: '0 10px', borderRadius: 'var(--pt-radius-sm)',
  border: '0.5px solid var(--pt-line)', background: 'var(--pt-bg)',
  font: 'inherit', fontSize: 12.5, color: 'var(--pt-fg)', outline: 'none', width: '100%',
} as const

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: templates } = await supabase
    .from('templates')
    .select('id, tenant_id, title, content, sort_order')
    .order('sort_order')

  const platform = (templates ?? []).filter(t => t.tenant_id === null)
  const own = (templates ?? []).filter(t => t.tenant_id !== null)

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Message templates</h2>
          <p>Reusable messages for the inbox composer. Platform templates can be customised — editing creates your own copy.</p>
        </div>
      </div>

      {/* Your templates */}
      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd">
          <div><h3>Your templates</h3><p>{own.length} custom template{own.length !== 1 ? 's' : ''}</p></div>
        </header>
        <div className="pt-card-body" style={{ padding: 0 }}>
          <ul className="pt-tpl-settings-list">
            {own.map(t => (
              <li key={t.id} className="pt-tpl-settings-row">
                <div className="pt-tpl-settings-info">
                  <div className="pt-tpl-settings-title">{t.title}</div>
                  <div className="pt-tpl-settings-body">{t.content.slice(0, 100)}{t.content.length > 100 ? '…' : ''}</div>
                </div>
                <div className="pt-tpl-settings-actions">
                  <details>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Edit</summary>
                    <form action={updateTemplate as never} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="isPlatform" value="false" />
                      <input name="title" defaultValue={t.title} required style={inputStyle} />
                      <textarea name="content" defaultValue={t.content} required rows={4} style={taStyle} />
                      <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Save</button>
                    </form>
                  </details>
                  <form action={deleteTemplate as never}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="pt-st-mini pt-st-mini-warn">Delete</button>
                  </form>
                </div>
              </li>
            ))}
            {own.length === 0 && (
              <li style={{ padding: '12px 16px', color: 'var(--pt-fg-4)', fontSize: 12 }}>No custom templates yet.</li>
            )}
          </ul>
        </div>
      </section>

      {/* Add new */}
      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd"><div><h3>Add template</h3></div></header>
        <div className="pt-card-body">
          <form action={createTemplate as never} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input name="title" placeholder="Template name" required style={inputStyle} />
            <textarea name="content" placeholder="Template content — use [BRACKETS] for variables" required rows={4} style={taStyle} />
            <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Add template</button>
          </form>
        </div>
      </section>

      {/* Platform templates */}
      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd">
          <div><h3>Platform templates</h3><p>Provided by Peptech. Editing creates your own copy.</p></div>
        </header>
        <div className="pt-card-body" style={{ padding: 0 }}>
          <ul className="pt-tpl-settings-list">
            {platform.map(t => (
              <li key={t.id} className="pt-tpl-settings-row">
                <div className="pt-tpl-settings-info">
                  <div className="pt-tpl-settings-title">{t.title}</div>
                  <div className="pt-tpl-settings-body">{t.content.slice(0, 100)}{t.content.length > 100 ? '…' : ''}</div>
                </div>
                <div className="pt-tpl-settings-actions">
                  <details>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Customise</summary>
                    <form action={updateTemplate as never} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="isPlatform" value="true" />
                      <input name="title" defaultValue={t.title} required style={inputStyle} />
                      <textarea name="content" defaultValue={t.content} required rows={4} style={taStyle} />
                      <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Save as my template</button>
                    </form>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 1: Create actions.ts**

Create `src/app/settings/templates/actions.ts` with the full content above.

- [ ] **Step 2: Create page.tsx**

Create `src/app/settings/templates/page.tsx` with the full content above.

- [ ] **Step 3: Add CSS to styles/settings.css**

Read `styles/settings.css` to find the end, then append:

```css
/* ── Template settings ──────────────────────────────────────────────────── */
.pt-tpl-settings-list { list-style: none; margin: 0; padding: 0; }
.pt-tpl-settings-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; padding: 12px 16px;
  border-bottom: 0.5px solid var(--pt-line-soft);
}
.pt-tpl-settings-row:last-child { border-bottom: none; }
.pt-tpl-settings-info { flex: 1; min-width: 0; }
.pt-tpl-settings-title { font-size: 13px; font-weight: 500; color: var(--pt-fg); margin-bottom: 3px; }
.pt-tpl-settings-body { font-size: 11.5px; color: var(--pt-fg-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-tpl-settings-actions { display: flex; align-items: flex-start; gap: 8px; flex-shrink: 0; }
```

- [ ] **Step 4: Mark templates as built in SettingsNav**

In `src/components/settings/SettingsNav.tsx`, change:
```typescript
{ id: 'templates', label: 'Message templates', icon: Icons.doc, href: '/settings/templates', built: false },
```
to:
```typescript
{ id: 'templates', label: 'Message templates', icon: Icons.doc, href: '/settings/templates', built: true },
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run
```
Expected: all 65 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/templates/ src/components/settings/SettingsNav.tsx styles/settings.css
git commit -m "feat: message templates settings page with copy-on-edit for platform templates"
```

---

## Verification Checklist

- [ ] "e2e encrypted" label no longer appears in the conversation header
- [ ] Channel filter pills (All channels / WhatsApp / Telegram / Email) appear below status pills; filtering works correctly
- [ ] `{{ template }}` button in composer opens a picker panel; clicking a template inserts content into the draft; search filters by title and content
- [ ] Settings → Message templates shows "Your templates" + "Add template" + "Platform templates" sections
- [ ] Adding a template creates a tenant-owned row visible in the picker
- [ ] Customising a platform template creates a tenant copy and hides the platform original from the composer picker
- [ ] Deleting a tenant template removes it; platform templates have no delete button
