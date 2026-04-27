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

## 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them.
- If a simpler approach exists, say so.
- If something is unclear, stop. Name what's confusing.

## 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No “flexibility” that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

## 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

- Don't “improve” adjacent code or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice dead code, mention it — don't delete it.

## 4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- “Add validation” → “Write tests, then make them pass”
- “Fix the bug” → “Reproduce it in a test, then fix”
- “Refactor X” → “Ensure tests pass before and after”
