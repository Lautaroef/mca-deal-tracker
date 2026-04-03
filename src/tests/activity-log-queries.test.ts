import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  users,
  workspaces,
  teamMemberships,
} from "@/server/db/schema";
import {
  createWorkspaceScope,
  type WorkspaceContext,
} from "@/server/lib/workspace-scope";
import { createDeal, updateDealStatus, assignDeal } from "@/server/services/deals";
import { getDealEvents, getUserEvents } from "@/server/services/activity-log";

// ─── Test context ───────────────────────────────────────────────────────────

let wsA: typeof workspaces.$inferSelect;
let wsB: typeof workspaces.$inferSelect;
let adminA: typeof users.$inferSelect;
let repEmily: typeof users.$inferSelect;
let adminB: typeof users.$inferSelect;
let adminTeamIdA: string | null;

beforeAll(async () => {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, "Apex Funding Brokers"));
  if (!ws) throw new Error("Workspace A not found — run seed first");
  wsA = ws;

  const [wsb] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, "Summit Capital Group"));
  if (!wsb) throw new Error("Workspace B not found — run seed first");
  wsB = wsb;

  const allUsersA = await db
    .select()
    .from(users)
    .where(eq(users.workspaceId, wsA.id));
  adminA = allUsersA.find((u) => u.role === "admin")!;
  repEmily = allUsersA.find((u) => u.name === "Emily Rodriguez")!;

  const allUsersB = await db
    .select()
    .from(users)
    .where(eq(users.workspaceId, wsB.id));
  adminB = allUsersB.find((u) => u.role === "admin")!;

  const [membership] = await db
    .select()
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, adminA.id));
  adminTeamIdA = membership?.teamId ?? null;
});

function buildCtxA(): WorkspaceContext {
  return {
    workspaceId: wsA.id,
    userId: adminA.id,
    userRole: adminA.role,
    teamId: adminTeamIdA,
  };
}

function buildScopeA() {
  return createWorkspaceScope(db, buildCtxA());
}

async function createTestDeal() {
  return createDeal(db, buildCtxA(), {
    merchantName: `ActivityLog Test ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    merchantEmail: "test@example.com",
    requestedAmount: "10000.00",
    assignedUserId: repEmily.id,
    status: "lead",
  });
}

// ─── getDealEvents tests ────────────────────────────────────────────────────

describe("getDealEvents", () => {
  it("returns events for a deal in the correct workspace", async () => {
    const deal = await createTestDeal();
    const events = await getDealEvents(db, deal.id, wsA.id);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].eventType).toBe("deal_created");
    expect(events[0].dealId).toBe(deal.id);
    expect(events[0].workspaceId).toBe(wsA.id);
  });

  it("returns events in reverse chronological order (most recent first)", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");
    await updateDealStatus(db, scope, deal.id, "ready_to_submit");

    const events = await getDealEvents(db, deal.id, wsA.id);
    expect(events.length).toBe(3); // created + 2 status changes
    // Most recent first
    expect(events[0].eventType).toBe("status_changed");
    expect(events[events.length - 1].eventType).toBe("deal_created");

    // Timestamps should be descending
    for (let i = 0; i < events.length - 1; i++) {
      expect(events[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        events[i + 1].createdAt.getTime(),
      );
    }
  });

  it("returns empty array when querying a deal with a different workspace ID (workspace scoping)", async () => {
    const deal = await createTestDeal(); // deal is in wsA

    // Query with wsB's ID — should return nothing
    const events = await getDealEvents(db, deal.id, wsB.id);
    expect(events).toHaveLength(0);
  });

  it("cannot see Workspace A deal events when querying with Workspace B ID", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");

    // wsA events exist
    const eventsA = await getDealEvents(db, deal.id, wsA.id);
    expect(eventsA.length).toBeGreaterThan(0);

    // wsB sees nothing for this deal
    const eventsB = await getDealEvents(db, deal.id, wsB.id);
    expect(eventsB).toHaveLength(0);
  });

  it("includes all event types (created, status_changed, assigned) for a deal's lifecycle", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");

    const repJake = (
      await db.select().from(users).where(eq(users.workspaceId, wsA.id))
    ).find((u) => u.name === "Jake Thompson")!;
    await assignDeal(db, scope, deal.id, repJake.id);

    const events = await getDealEvents(db, deal.id, wsA.id);
    const types = events.map((e) => e.eventType);
    expect(types).toContain("deal_created");
    expect(types).toContain("status_changed");
    expect(types).toContain("deal_assigned");
  });
});

// ─── getUserEvents tests ────────────────────────────────────────────────────

describe("getUserEvents", () => {
  it("returns all events performed by a specific actor", async () => {
    // Create a deal as adminA — this creates an event with adminA as actor
    const deal = await createTestDeal();
    const events = await getUserEvents(db, adminA.id, wsA.id);
    expect(events.length).toBeGreaterThanOrEqual(1);

    // All returned events should have this actor
    for (const event of events) {
      expect(event.actorId).toBe(adminA.id);
    }
  });

  it("filters events by date when provided", async () => {
    // Create a deal today
    await createTestDeal();

    const today = new Date();
    const eventsToday = await getUserEvents(db, adminA.id, wsA.id, today);
    expect(eventsToday.length).toBeGreaterThanOrEqual(1);

    // Query with a date far in the past — should find nothing
    const pastDate = new Date("2020-01-01");
    const eventsPast = await getUserEvents(db, adminA.id, wsA.id, pastDate);
    expect(eventsPast).toHaveLength(0);
  });

  it("returns empty array for a user with no events in this workspace", async () => {
    // adminB has events only in wsB — should get nothing when querying wsA
    const events = await getUserEvents(db, adminB.id, wsA.id);
    expect(events).toHaveLength(0);
  });

  it("scopes by workspace — admin A events not visible via workspace B", async () => {
    await createTestDeal(); // adminA creates a deal in wsA

    // Query adminA's events in wsB context — should be empty
    const events = await getUserEvents(db, adminA.id, wsB.id);
    expect(events).toHaveLength(0);
  });

  it("returns events in reverse chronological order", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");

    const events = await getUserEvents(db, adminA.id, wsA.id);
    for (let i = 0; i < events.length - 1; i++) {
      expect(events[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        events[i + 1].createdAt.getTime(),
      );
    }
  });

  it("date filter spans exactly one day (00:00:00 to 23:59:59)", async () => {
    await createTestDeal();
    const today = new Date();
    const eventsToday = await getUserEvents(db, adminA.id, wsA.id, today);

    // All events should have a createdAt on today's date
    for (const event of eventsToday) {
      const eventDate = new Date(event.createdAt);
      expect(eventDate.getFullYear()).toBe(today.getFullYear());
      expect(eventDate.getMonth()).toBe(today.getMonth());
      expect(eventDate.getDate()).toBe(today.getDate());
    }
  });
});
