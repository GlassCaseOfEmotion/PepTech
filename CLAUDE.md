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
