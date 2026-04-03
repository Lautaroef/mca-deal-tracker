# MCA Pilot Trial — Multi-Tenant Deal Tracker

## Project Overview

Trial task for MCA Pilot, a CRM for merchant cash advance brokers. This is a standalone 2-day build evaluated on **three core architectural decisions**, not feature completeness or UI polish.

**What's being evaluated (in priority order):**
1. **Workspace isolation at the query layer** — every query scoped to workspace via a reusable pattern (not copy-pasted `WHERE workspace_id = ?`)
2. **Status transition validation** — declarative state machine, server-enforced, descriptive errors
3. **Activity log design** — structured JSONB events (not freetext), queryable programmatically

**What's NOT evaluated:** UI polish, scaffolding elegance, feature completeness beyond the brief.

## Tech Stack

- **Next.js 15** (App Router) + **React 19**
- **Drizzle ORM** (required — this is the ORM for the real build)
- **PostgreSQL** via Supabase
- **tRPC v11** for API layer
- **Tailwind CSS v4** + **shadcn/ui** (base-nova style)
- **Vitest** for testing
- **Zod v4** for runtime validation
- **pnpm** as package manager

## Architecture Decisions

### 1. Workspace Isolation — Scoped Query Builder

All database queries go through a `WorkspaceScope` that automatically injects `WHERE workspace_id = ?` and `AND deleted_at IS NULL`. Service functions receive this scoped context — they cannot query without it.

- tRPC context extracts the current user's `workspaceId`
- A `workspaceScope()` utility wraps Drizzle to always filter by workspace
- Role-based visibility (Admin/TeamLeader/Rep) is applied as additional WHERE clauses within the scope
- **No raw `db.select()` in service functions** — always use the scoped builder

### 2. Status Transitions — Declarative Transition Map

A `VALID_TRANSITIONS: Record<DealStatus, DealStatus[]>` defines all legal moves. A pure `validateTransition(from, to)` function returns success or a descriptive error like: `"Cannot transition from 'Lead' to 'Funded'. Valid transitions from 'Lead': New Application"`.

- Lives in the service layer (not route handlers)
- 10 statuses across 6 segments (Intake, Submission, Negotiating, Closing, Funded, Terminal)
- Validation runs before any status update, inside the same transaction

### 3. Activity Log — Structured JSONB Events

Each mutation writes a typed event: `deal_created`, `status_changed`, `deal_assigned`, `deal_deleted`. The `metadata` JSONB column contains old/new values per event type.

- Events written in the same DB transaction as the mutation
- Typed with Zod discriminated unions per event type
- Queryable: "all status changes on deal X" or "everything user Y did today"

### 4. Auth — Dev Toolbar (Trial Only)

Seeded users + cookie-based session + dev toolbar to switch users. Not a production auth system — the brief explicitly says to keep this simple.

### 5. Visibility Cascade

Enforced at the **query layer**, not UI:
- **Admin** — all deals in workspace
- **Team Leader** — deals assigned to members of their team
- **Rep** — only deals assigned to them

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout with dev toolbar
│   ├── page.tsx                  # Redirect to /deals
│   ├── deals/
│   │   ├── page.tsx              # Deal list (filtered by role)
│   │   └── [id]/page.tsx         # Deal detail + activity timeline
│   ├── api/
│   │   ├── trpc/[trpc]/route.ts  # tRPC HTTP handler
│   │   └── auth/route.ts         # Dev auth endpoint (set current user)
├── server/
│   ├── db/
│   │   ├── index.ts              # Drizzle client + connection
│   │   ├── schema.ts             # All table definitions
│   │   └── seed.ts               # Seed script (npm run seed)
│   ├── trpc/
│   │   ├── init.ts               # tRPC init, context, middleware
│   │   ├── router.ts             # Root router
│   │   └── routers/
│   │       └── deals.ts          # Deal procedures (thin)
│   ├── services/
│   │   ├── deals.ts              # Deal business logic + activity logging
│   │   └── activity-log.ts       # Activity log write helpers
│   └── lib/
│       ├── workspace-scope.ts    # THE workspace isolation pattern
│       ├── status-machine.ts     # Transition map + validation
│       └── visibility.ts         # Role-based query filters
├── lib/
│   ├── trpc.ts                   # tRPC React client
│   └── utils.ts                  # shadcn utility (cn)
└── components/
    ├── dev-toolbar.tsx            # User switcher for trial
    ├── deal-list.tsx              # Deal list table
    ├── deal-detail.tsx            # Deal detail view
    ├── deal-form.tsx              # Create/edit deal form
    └── activity-timeline.tsx      # Activity log renderer
```

## Database Schema (Tables)

- `workspaces` — id, name, created_at
- `users` — id, workspace_id, name, email, role (admin/team_leader/rep)
- `teams` — id, workspace_id, name
- `team_memberships` — id, team_id, user_id
- `deals` — id, workspace_id, assigned_user_id, merchant_name, merchant_email, merchant_phone, requested_amount, status (enum), notes, created_at, updated_at, deleted_at (soft delete)
- `event_log` — id, workspace_id, deal_id, actor_id, event_type (enum), metadata (JSONB), created_at

## Deal Statuses & Valid Transitions

| # | Status | Segment |
|---|--------|---------|
| 1 | Lead | Intake |
| 2 | New Application | Intake |
| 3 | Missing Documents | Intake |
| 4 | Ready to Submit | Submission |
| 5 | Submitted | Submission |
| 6 | Approved | Negotiating |
| 7 | Offer Accepted | Closing |
| 8 | Contracts Out | Closing |
| 9 | Funded | Funded |
| 10 | Dead | Terminal |

**Transitions:**
- Lead → New Application
- New Application → Missing Documents, Ready to Submit
- Missing Documents → Ready to Submit, Dead
- Ready to Submit → Submitted, Dead
- Submitted → Approved, Dead
- Approved → Offer Accepted, Ready to Submit (resubmission), Dead
- Offer Accepted → Contracts Out, Approved (back to negotiation), Dead
- Contracts Out → Funded, Dead
- Funded → (terminal)
- Dead → Lead (only exit)

## Seed Data

Two workspaces seeded via `pnpm run seed`:

**Workspace A ("Apex Funding Brokers"):**
- 1 Admin, 1 Team Leader, 2 Reps on same team
- 8-10 deals at various statuses assigned across the reps

**Workspace B ("Summit Capital Group"):**
- 1 Admin, 1 Rep
- 3-4 deals (exists to test workspace isolation)

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm seed         # Run seed script
pnpm test         # Run test suite
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio
```

## Code Conventions

- **Service layer owns business logic.** tRPC route handlers are thin — they validate input with Zod, call a service function, and return.
- **No raw db queries in route handlers.** Always go through the scoped builder or service functions.
- **Zod for all input validation** at system boundaries (tRPC inputs).
- **Descriptive error messages.** Never "Something went wrong" — explain what failed and what's valid.
- **TypeScript strict mode.** No `any`, no `@ts-ignore`.
- **Prefer co-location.** Keep related logic close together.

## Testing Strategy

Tests cover the delivery walkthrough scenarios:
1. Workspace isolation (cross-workspace data invisible)
2. Visibility cascade (admin/team-leader/rep see correct subsets)
3. Status transition validation (valid transitions succeed, invalid return descriptive errors)
4. Activity log creation (events written with correct structure on each mutation)
5. Soft delete (disappears from lists, still in DB)

Tests run against a real database (test schema), not mocks.

## Delivery Checklist

- [ ] Seed script populates both workspaces
- [ ] Workspace B data invisible to Workspace A users
- [ ] Admin sees all deals, team leader sees team deals, rep sees own deals
- [ ] Status transitions validated server-side with descriptive errors
- [ ] Activity log shows structured JSONB entries on deal detail page
- [ ] Soft delete removes from lists, preserves in DB
- [ ] Test suite passes (`pnpm test`)
- [ ] DECISIONS.md written
