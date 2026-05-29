# Design v2 Phase A — Primitives + Inbox Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared `Avatar` (vivid colour + channel badge) and `Badge` (soft-fill) primitives, add the additive design tokens, and apply them to the inbox — validating the whole "warm" language on one surface before it goes global.

**Architecture:** Additive-only at the global level — new tokens (family-hue palette, soft shadow, avatar palette) and two new components in `src/components/ui/`. The warmer **type/spacing** is applied **scoped to the inbox** (`styles/inbox.css` overrides), NOT to `:root`, so no other surface changes yet (the global token promotion is Phase B). The inbox swaps its inline `.pt-ixt-av` markup and `.pt-tag-*` spans for the new primitives.

**Tech Stack:** Next.js 15, React client components, plain CSS (`styles/peptech.css`, `styles/inbox.css`, `pt-*`).

**Spec:** [docs/superpowers/specs/2026-05-29-design-system-v2-uplift-design.md](../specs/2026-05-29-design-system-v2-uplift-design.md). Inbox structure (Phases 1–3) already shipped.

**Note on existing avatars:** the inbox already renders `.pt-ixt-av` (initials + channel-coloured text + a tiny corner channel icon) in `IxThread` (`InboxView.tsx:36-76`) and the conversation header (`ConversationPane.tsx:42-48`). Phase A *elevates* these into vivid colour avatars via the shared component — it is not adding avatars from nothing.

---

## File Structure

- **Create** `src/components/ui/Avatar.tsx` — vivid colour avatar (deterministic hue from name) + initials + optional channel-badge dot.
- **Create** `src/components/ui/Badge.tsx` — soft-fill, fully-rounded pill with a `tone` prop; new `.pt-badge*` classes (does NOT restyle the global `.pt-tag` — other surfaces keep theirs until their phase).
- **Modify** `styles/peptech.css` — additive tokens only: family-hue palette, `--pt-shadow-soft`, the avatar hue palette, `.pt-avatar*` + `.pt-badge*` rules.
- **Modify** `styles/inbox.css` — inbox-scoped warmer type + soft elevation on the active row.
- **Modify** `src/components/inbox/InboxView.tsx` — `IxThread`: use `<Avatar>` + `<Badge>`.
- **Modify** `src/components/inbox/ConversationPane.tsx` — header uses `<Avatar>`.
- **Modify** `src/components/inbox/ViewsColumn.tsx` — channel rows get a channel-colour dot.

Deferred (later phases / open decisions): per-message-bubble sender avatars (redundant in 1:1 threads), sparkline-on-rows, the catalog `MiniSparkline`/fill-bar promotion, and the **global** token promotion (Phase B).

---

### Task 1: Additive design tokens

**Files:**
- Modify: `styles/peptech.css`

- [ ] **Step 1: Append the new tokens**

In `styles/peptech.css`, inside `:root` (after the existing channel-colour tokens, ~line 36), add:
```css
  /* v2 — soft elevation (Phase A additive; promoted globally in Phase B) */
  --pt-shadow-soft: 0 2px 8px rgba(20, 20, 40, 0.06);

  /* v2 — family-hue palette (lifted from catalog) as reusable tokens */
  --pt-hue-glp1: 30;
  --pt-hue-healing: 145;
  --pt-hue-cosmetic: 320;
  --pt-hue-mito: 240;
  --pt-hue-gh: 90;
```
These are additive — nothing references them yet outside the new components, so no existing surface changes.

- [ ] **Step 2: Verify nothing shifted**

Run: `npm run dev` (or rely on reading if the Google-Fonts cert blocks dev) — confirm the app looks identical (additive tokens only).

- [ ] **Step 3: Commit**

```bash
git add styles/peptech.css
git commit -m "feat(design): additive v2 tokens — soft shadow + family-hue palette"
```

---

### Task 2: `Avatar` primitive

**Files:**
- Create: `src/components/ui/Avatar.tsx`
- Modify: `styles/peptech.css`

- [ ] **Step 1: Write the component**

```tsx
// src/components/ui/Avatar.tsx
import { initials } from '@/types/inbox'

type Channel = 'wa' | 'tg' | 'em'

// 8 pleasant, well-spaced hues. A stable hash of the name picks one, so each
// person keeps the same colour across the app (respond.io-style identity).
const HUES = [350, 25, 90, 145, 190, 240, 285, 320]

function hueFor(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

export function Avatar({ name, channel, size = 36 }: { name: string; channel?: Channel; size?: number }) {
  const hue = hueFor(name || '?')
  return (
    <div
      className="pt-avatar"
      style={{ width: size, height: size, ['--pt-av-h' as string]: hue }}
      aria-hidden
    >
      <span className="pt-avatar-init">{initials(name)}</span>
      {channel && <i className={`pt-avatar-ch pt-avatar-ch-${channel}`} />}
    </div>
  )
}
```

- [ ] **Step 2: Add the CSS**

Append to `styles/peptech.css`:
```css
/* ─── Avatar primitive (v2) ──────────────────────────────────────────────── */
.pt-avatar {
  position: relative; flex: 0 0 auto;
  border-radius: 50%;
  display: grid; place-items: center;
  background: oklch(0.62 0.15 var(--pt-av-h));
  color: #fff;
  font-weight: 600;
  font-size: calc(1px * 0.4 * 36); /* ~14px at 36px; overridden per size below */
}
.pt-avatar-init { font-size: 0.4em; line-height: 1; }
.pt-avatar { font-size: inherit; }
.pt-avatar-ch {
  position: absolute; right: -2px; bottom: -2px;
  width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--pt-bg);
}
.pt-avatar-ch-wa { background: var(--pt-wa); }
.pt-avatar-ch-tg { background: var(--pt-tg); }
.pt-avatar-ch-em { background: var(--pt-em); }
```
Note: the initials size keys off the avatar's box. Simplify by setting initials font-size directly: replace the `.pt-avatar` font rules above with a fixed `.pt-avatar-init { font-size: 13px; font-weight: 600; }` and drop the `calc`/`0.4em` lines (the component passes `size` for the box; 13px initials read well at 36–42px). Use the simpler version.

Final CSS (use this, not the calc version):
```css
.pt-avatar {
  position: relative; flex: 0 0 auto;
  border-radius: 50%;
  display: grid; place-items: center;
  background: oklch(0.62 0.15 var(--pt-av-h));
  color: #fff;
}
.pt-avatar-init { font-size: 13px; font-weight: 600; line-height: 1; }
.pt-avatar-ch {
  position: absolute; right: -2px; bottom: -2px;
  width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--pt-bg);
}
.pt-avatar-ch-wa { background: var(--pt-wa); }
.pt-avatar-ch-tg { background: var(--pt-tg); }
.pt-avatar-ch-em { background: var(--pt-em); }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep Avatar` → no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Avatar.tsx styles/peptech.css
git commit -m "feat(ui): Avatar primitive — vivid colour + channel badge"
```

---

### Task 3: `Badge` primitive

**Files:**
- Create: `src/components/ui/Badge.tsx`
- Modify: `styles/peptech.css`

- [ ] **Step 1: Write the component**

```tsx
// src/components/ui/Badge.tsx
type BadgeTone = 'neutral' | 'accent' | 'lead' | 'vip' | 'new' | 'warn' | 'ok' | 'danger'

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return <span className={`pt-badge pt-badge-${tone}`}>{children}</span>
}
```

- [ ] **Step 2: Add the CSS**

Append to `styles/peptech.css`. These mirror the existing soft tokens but fully-rounded + v2 sizing. They do NOT touch `.pt-tag` (other surfaces keep theirs until their phase):
```css
/* ─── Badge primitive (v2 soft-fill, fully rounded) ──────────────────────── */
.pt-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.01em;
  padding: 2px 9px; border-radius: 999px; white-space: nowrap;
}
.pt-badge-neutral { background: oklch(from var(--pt-fg) l c h / 0.06); color: var(--pt-fg-3); }
.pt-badge-accent  { background: var(--pt-accent-soft); color: var(--pt-accent-fg); }
.pt-badge-vip     { background: var(--pt-accent-soft); color: var(--pt-accent-fg); }
.pt-badge-lead    { background: var(--pt-cool-soft);   color: var(--pt-cool); }
.pt-badge-new     { background: var(--pt-cool-soft);   color: var(--pt-cool); }
.pt-badge-warn    { background: var(--pt-warn-soft);   color: var(--pt-warn); }
.pt-badge-ok      { background: var(--pt-ok-soft);     color: var(--pt-ok); }
.pt-badge-danger  { background: oklch(from var(--pt-danger) l c h / 0.12); color: var(--pt-danger); }
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep Badge` → no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Badge.tsx styles/peptech.css
git commit -m "feat(ui): Badge primitive — soft-fill rounded pill with tones"
```

---

### Task 4: Apply primitives to the inbox + warmer scoped type

**Files:**
- Modify: `src/components/inbox/InboxView.tsx`
- Modify: `src/components/inbox/ConversationPane.tsx`
- Modify: `src/components/inbox/ViewsColumn.tsx`
- Modify: `styles/inbox.css`

- [ ] **Step 1: Thread row — Avatar**

In `src/components/inbox/InboxView.tsx`, add the import:
```ts
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
```
In `IxThread`, replace the avatar block:
```tsx
      <div className="pt-ixt-av" data-channel={t.channel}>
        <span>{initials(t.name)}</span>
        <i className={`pt-thread-ch pt-ch-${t.channel}`}>{ChIcon && <ChIcon size={9} />}</i>
      </div>
```
with:
```tsx
      <Avatar name={t.name} channel={t.channel} size={38} />
```
(The `ChIcon`/`CH_ICONS` lookup line at the top of `IxThread` becomes unused — remove it if nothing else in the function references it.)

- [ ] **Step 2: Thread row — Badges**

In `IxThread`'s `.pt-ixt-row3`, replace the `.pt-tag*` spans with `<Badge>`:
```tsx
        <div className="pt-ixt-row3">
          {t.status === 'snoozed' && <Badge tone="neutral">⏰ snoozed</Badge>}
          {t.lifecycleStage === 'lead' && <Badge tone="lead">Lead</Badge>}
          {t.tags.includes('vip') && <Badge tone="vip">VIP</Badge>}
          {t.tags.includes('new') && <Badge tone="new">new</Badge>}
          {t.tags.includes('payment') && <Badge tone="warn">payment</Badge>}
          {t.tags.includes('repeat') && !t.tags.includes('vip') && <Badge tone="neutral">repeat</Badge>}
          {t.tags.includes('shipping') && <Badge tone="neutral">shipping</Badge>}
          {t.tags.includes('reorder') && <Badge tone="neutral">reorder</Badge>}
          <span className="pt-ixt-trust mono">trust {t.trust}</span>
        </div>
```
(Drop the `waitlist` tag line only if it wasn't in the original — keep parity with the current set; the original had a `waitlist` plain `.pt-tag` — render it as `<Badge tone="neutral">waitlist</Badge>`.)

- [ ] **Step 3: Conversation header — Avatar**

In `src/components/inbox/ConversationPane.tsx`, add `import { Avatar } from '@/components/ui/Avatar'`, and replace the header avatar block (lines ~42-48):
```tsx
  <div className="pt-ixt-av" data-channel={conversation.channel_type}>
    <span>{initials(name)}</span>
    <i className={`pt-thread-ch pt-ch-${conversation.channel_type}`}>
      <ChannelIcon channelType={conversation.channel_type} size={9} />
    </i>
  </div>
```
with:
```tsx
  <Avatar name={name} channel={conversation.channel_type as 'wa' | 'tg' | 'em'} size={36} />
```
(If `ChannelIcon`/`initials` imports become unused in this file, remove them.)

- [ ] **Step 4: Views column — channel dots**

In `src/components/inbox/ViewsColumn.tsx`, the `Row` renders `pt-ix-view-label`. For channel rows, prepend a colour dot. Change the `CHANNELS` rendering to pass a dot. Simplest: give `Row` an optional `dot` class. Update the channel map render:
```tsx
        <div className="pt-ix-views-sec">Channels</div>
        {CHANNELS.map(v => (
          <button key={v.id} className={`pt-ix-view ${view === v.id ? 'is-on' : ''}`} onClick={() => setView(v.id)}>
            <span className="pt-ix-view-label">
              <i className={`pt-ch-dot pt-ch-dot-${v.id}`} />{v.label}
            </span>
            <span className="pt-ix-view-count">{countFor(v.id)}</span>
          </button>
        ))}
```
And in `styles/inbox.css` add:
```css
.pt-ch-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; vertical-align: middle; }
.pt-ch-dot-wa { background: var(--pt-wa); }
.pt-ch-dot-tg { background: var(--pt-tg); }
.pt-ch-dot-em { background: var(--pt-em); }
```

- [ ] **Step 5: Warmer inbox type + soft elevation (scoped to inbox)**

In `styles/inbox.css`, scope the warmer scale to the inbox so it doesn't leak globally (Phase B promotes globally). Add:
```css
/* v2 warmth — scoped to the inbox for the Phase A showcase */
.pt-ixt-name { font-size: 14.5px; }
.pt-ixt-snip { font-size: 13px; }
.pt-ix-conv-name { font-size: 15px; }
.pt-ixt { border-radius: 10px; }
.pt-ixt.is-active { box-shadow: var(--pt-shadow-soft); }
.pt-ix-view { font-size: 13px; }
```
(If any of those selectors already set a font-size, override by placing these after the existing rule or merging — read the file and adjust so these win.)

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "(InboxView|ConversationPane|ViewsColumn)"` → no output.
Run: `grep -rn "pt-ixt-av\|pt-thread-ch" src/components/inbox` → expect none (both avatar sites now use `<Avatar>`). If `.pt-ixt-av`/`.pt-thread-ch` CSS is now unused, leave the CSS for now (other code may reference; confirm with a repo-wide grep and remove only if truly orphaned).
Visual (if dev runs): vivid colour avatars with channel dots on rows + header; rounded soft-fill badges; channel dots in the views column; larger names; soft shadow on the active row.

- [ ] **Step 7: Commit**

```bash
git add src/components/inbox/InboxView.tsx src/components/inbox/ConversationPane.tsx src/components/inbox/ViewsColumn.tsx styles/inbox.css
git commit -m "feat(inbox): apply Avatar + Badge primitives + warm type (v2 showcase)"
```

---

### Task 5: Phase A ship checkpoint

- [ ] **Step 1: Code gates**

`npx tsc --noEmit 2>&1 | grep -E "(inbox|ui/Avatar|ui/Badge)"` → no errors.
`npx next lint --file src/components/ui/Avatar.tsx --file src/components/ui/Badge.tsx --file src/components/inbox/InboxView.tsx --file src/components/inbox/ConversationPane.tsx --file src/components/inbox/ViewsColumn.tsx` → no new errors.
`npm run test:run` → no new failures vs. baseline.

- [ ] **Step 2: Cross-surface no-leak check**

The warmth is supposed to be inbox-scoped in Phase A. Confirm `:root` only gained additive tokens (no type/spacing/radius change). Spot-check (read, or dev if available) that dashboard/orders/catalog look unchanged — only the inbox should look warmer.

- [ ] **Step 3: Manual QA + finish**

Verify Task 4 step 6 on the deploy/preview (light/dim/dark themes). Then use superpowers:finishing-a-development-branch to land Phase A. Phase B (global token promotion + dashboard) gets its own plan next.

---

## Self-Review

- **Spec coverage:** Avatar primitive ✓ (Task 2), Badge primitive ✓ (Task 3), additive tokens incl. family-hue palette + soft shadow ✓ (Task 1), inbox showcase — avatars on rows + header, soft-fill badges, channel dots, warmer type, soft elevation ✓ (Task 4), warmth kept inbox-scoped (global flip deferred to Phase B) ✓ (Task 4 step 5 + Task 5 step 2). Chromatic-indicator promotion + message-bubble avatars explicitly deferred.
- **Placeholder scan:** none. Task 2 step 2 intentionally shows a wrong-then-right CSS approach (the calc version vs the simpler fixed version) and instructs using the simpler one — to spare the implementer the dead-end; the final code is explicit.
- **Type/name consistency:** `Avatar({ name, channel, size })` and `Badge({ tone, children })` signatures consistent across definition (Tasks 2–3) and all call sites (Task 4). Channel ids `wa|tg|em` consistent with the existing `--pt-wa/tg/em` tokens and `.pt-avatar-ch-*` / `.pt-ch-dot-*` classes. The deterministic-hue avatar (name-hash) resolves the spec's open "avatar colour algorithm" decision: name-hash hue for identity + channel-colour badge dot for channel.
- **Risk:** `.pt-ixt-av`/`.pt-thread-ch` CSS may become orphaned after Task 4 — left in place (harmless) unless a repo-wide grep proves them fully unused. The avatar shape changes from 8px-rounded-square to a circle — intentional (respond.io identity), flag in QA if it clashes with the row grid alignment.
