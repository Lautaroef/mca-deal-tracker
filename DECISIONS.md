# Architectural Decisions

## 1. Workspace Isolation

**Approach:** A `createWorkspaceScope()` factory that takes a DB handle and a `WorkspaceContext` (workspace ID, user ID, role, team ID) and returns a `WorkspaceScope` object. Every read goes through `scope.queryDeals()` or `scope.findDeal(id)`, which always inject `WHERE workspace_id = ? AND deleted_at IS NULL` before any role-based visibility filters are applied. Service functions accept the scope as a parameter — they physically cannot query deals without it.

This gives us a single place to enforce tenant boundaries. If the scope is wrong, every query is wrong, so bugs are immediately obvious. The role-based visibility (admin sees all, team leader sees team, rep sees own) layers on top of the same base filter via `visibilityFilter()`, which builds Drizzle SQL conditions using `and()` / `inArray()` against the `deals` table. Write operations still verify ownership by calling `scope.findDeal()` before mutating — if the deal isn't visible, the write fails.

**Alternative considered:** Row-Level Security (RLS) in Postgres. RLS moves isolation to the database layer, which is appealing because it's impossible to bypass from application code. Rejected because it couples the isolation logic to the database engine (harder to test, harder to reason about in code review, and requires `SET` session variables per request in Drizzle which is awkward). The scoped-builder approach keeps the logic in TypeScript where it's testable with standard Vitest assertions and visible in code review alongside the business logic it protects.

## 2. Status Transitions

**Approach:** A `VALID_TRANSITIONS` record maps each `DealStatus` to its allowed next statuses. A pure function `validateTransition(from, to)` checks membership and returns either `{ valid: true }` or `{ valid: false, error: "Cannot transition from 'Lead' to 'Funded'. Valid transitions from 'Lead': New Application" }`. The map is a plain `Record<DealStatus, readonly DealStatus[]>` — no classes, no framework, no runtime overhead.

This runs in `updateDealStatus()` inside the service layer, before the transaction opens. The deal's current status is read via the workspace scope (so visibility is enforced), then the transition is validated, then the update and activity log write happen atomically in a single transaction. The transition map doubles as documentation: any engineer can read it and understand the entire deal lifecycle in 15 lines.

**Alternative considered:** A full state machine library (XState or similar) that models statuses as states with entry/exit actions, guards, and context. Rejected because the requirements are a directed graph of allowed transitions — there are no side effects tied to entering/exiting states, no parallel states, no delayed transitions. A state machine library would add a dependency and abstraction layer for something that's completely captured by a `Record` and a 10-line validation function. If the product later needs conditional guards (e.g., "can only move to Funded if compliance is approved"), the transition map can evolve into a `Record<DealStatus, Array<{ to: DealStatus; guard?: (deal) => boolean }>>` without changing the call sites.

## 3. Activity Log

**Approach:** An append-only `event_log` table with a JSONB `metadata` column. Each event type (`deal_created`, `status_changed`, `deal_assigned`, `deal_deleted`, `deal_updated`) has a corresponding Zod schema that defines the metadata shape. The `logEvent()` function is generic over event type — it validates metadata against the correct schema at runtime before inserting, so malformed events fail fast. Events are written inside the same DB transaction as the mutation they describe, guaranteeing that a status change and its log entry either both commit or neither does.

The metadata is structured, not freetext. A `status_changed` event stores `{ old_status, new_status, old_status_label, new_status_label }`. This means you can query "all status changes on deal X" or "everything user Y did today" with simple `WHERE` clauses on indexed columns (`deal_id`, `actor_id`, `created_at`), without parsing strings. The Zod discriminated union per event type gives TypeScript-level guarantees about what each event contains.

**Alternative considered:** A CDC (Change Data Capture) approach — using Postgres triggers or a logical replication stream to capture row-level changes automatically. Rejected because CDC captures *what changed* at the row level but not *who did it* or *why*. We need actor attribution and semantic event types (the difference between "status changed because a rep moved it forward" vs. "field updated because an admin corrected a typo"). Application-level event logging gives us that context naturally, since the service function already has the actor, the intent, and the before/after values in scope.
