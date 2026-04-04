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
import {
  createDeal,
  updateDeal,
  updateDealStatus,
  assignDeal,
  softDeleteDeal,
} from "@/server/services/deals";
import {
  getDealEvents,
  getUserEvents,
  getEventsByType,
  dealCreatedMetadataSchema,
  statusChangedMetadataSchema,
  dealAssignedMetadataSchema,
  dealDeletedMetadataSchema,
  dealUpdatedMetadataSchema,
  eventMetadataSchemas,
  type EventType,
} from "@/server/services/activity-log";

// ─── Test context ───────────────────────────────────────────────────────────

let wsA: typeof workspaces.$inferSelect;
let wsB: typeof workspaces.$inferSelect;
let adminA: typeof users.$inferSelect;
let repEmily: typeof users.$inferSelect;
let repJake: typeof users.$inferSelect;
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
  repJake = allUsersA.find((u) => u.name === "Jake Thompson")!;

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

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createTestDeal(overrides?: { assignedUserId?: string }) {
  return createDeal(db, buildCtxA(), {
    merchantName: `AuditTrail Test ${uid()}`,
    merchantEmail: "audit@example.com",
    requestedAmount: "15000.00",
    assignedUserId: overrides?.assignedUserId ?? repEmily.id,
    status: "lead",
  });
}

// ─── 1. Every mutation creates exactly one event ────────────────────────────

describe("every mutation creates exactly one event", () => {
  it("createDeal produces exactly one deal_created event", async () => {
    const deal = await createTestDeal();
    const events = await getDealEvents(db, deal.id, wsA.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("deal_created");
  });

  it("updateDeal produces exactly one deal_updated event", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDeal(db, scope, deal.id, { merchantName: "Changed Name" });

    const events = await getDealEvents(db, deal.id, wsA.id);
    const updateEvents = events.filter((e) => e.eventType === "deal_updated");
    expect(updateEvents).toHaveLength(1);
  });

  it("updateDealStatus produces exactly one status_changed event", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");

    const events = await getDealEvents(db, deal.id, wsA.id);
    const statusEvents = events.filter((e) => e.eventType === "status_changed");
    expect(statusEvents).toHaveLength(1);
  });

  it("assignDeal produces exactly one deal_assigned event", async () => {
    const deal = await createTestDeal({ assignedUserId: repEmily.id });
    const scope = buildScopeA();
    await assignDeal(db, scope, deal.id, repJake.id);

    const events = await getDealEvents(db, deal.id, wsA.id);
    const assignEvents = events.filter((e) => e.eventType === "deal_assigned");
    expect(assignEvents).toHaveLength(1);
  });

  it("softDeleteDeal produces exactly one deal_deleted event", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await softDeleteDeal(db, scope, deal.id);

    const events = await getDealEvents(db, deal.id, wsA.id);
    const deleteEvents = events.filter((e) => e.eventType === "deal_deleted");
    expect(deleteEvents).toHaveLength(1);
  });
});

// ─── 2. Event metadata is complete and typed ────────────────────────────────

describe("event metadata is complete and Zod-validated", () => {
  it("deal_created metadata passes dealCreatedMetadataSchema", async () => {
    const deal = await createTestDeal();
    const events = await getDealEvents(db, deal.id, wsA.id);
    const event = events.find((e) => e.eventType === "deal_created")!;
    const parsed = dealCreatedMetadataSchema.safeParse(event.metadata);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.merchant_name).toBe(deal.merchantName);
      expect(parsed.data.status).toBe("lead");
      expect(parsed.data.status_label).toBe("Lead");
      expect(parsed.data.assigned_user_id).toBe(repEmily.id);
      expect(parsed.data.assigned_user_name).toBe("Emily Rodriguez");
      expect(parsed.data.requested_amount).toBe("15000.00");
    }
  });

  it("status_changed metadata passes statusChangedMetadataSchema", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");

    const events = await getDealEvents(db, deal.id, wsA.id);
    const event = events.find((e) => e.eventType === "status_changed")!;
    const parsed = statusChangedMetadataSchema.safeParse(event.metadata);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.old_status).toBe("lead");
      expect(parsed.data.new_status).toBe("new_application");
      expect(parsed.data.old_status_label).toBe("Lead");
      expect(parsed.data.new_status_label).toBe("New Application");
    }
  });

  it("deal_assigned metadata passes dealAssignedMetadataSchema", async () => {
    const deal = await createTestDeal({ assignedUserId: repEmily.id });
    const scope = buildScopeA();
    await assignDeal(db, scope, deal.id, repJake.id);

    const events = await getDealEvents(db, deal.id, wsA.id);
    const event = events.find((e) => e.eventType === "deal_assigned")!;
    const parsed = dealAssignedMetadataSchema.safeParse(event.metadata);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.old_user_id).toBe(repEmily.id);
      expect(parsed.data.new_user_id).toBe(repJake.id);
      expect(parsed.data.old_user_name).toBe("Emily Rodriguez");
      expect(parsed.data.new_user_name).toBe("Jake Thompson");
    }
  });

  it("deal_deleted metadata passes dealDeletedMetadataSchema", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await softDeleteDeal(db, scope, deal.id);

    const events = await getDealEvents(db, deal.id, wsA.id);
    const event = events.find((e) => e.eventType === "deal_deleted")!;
    const parsed = dealDeletedMetadataSchema.safeParse(event.metadata);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.merchant_name).toBe(deal.merchantName);
      expect(parsed.data.status_at_deletion).toBe("lead");
      expect(parsed.data.status_at_deletion_label).toBe("Lead");
    }
  });

  it("deal_updated metadata passes dealUpdatedMetadataSchema", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDeal(db, scope, deal.id, { merchantName: "Zod Validated Corp" });

    const events = await getDealEvents(db, deal.id, wsA.id);
    const event = events.find((e) => e.eventType === "deal_updated")!;
    const parsed = dealUpdatedMetadataSchema.safeParse(event.metadata);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.changes).toHaveLength(1);
      expect(parsed.data.changes[0].field).toBe("merchant_name");
      expect(parsed.data.changes[0].old_value).toBe(deal.merchantName);
      expect(parsed.data.changes[0].new_value).toBe("Zod Validated Corp");
    }
  });
});

// ─── 3. Transactional integrity ─────────────────────────────────────────────

describe("transactional integrity", () => {
  it("failed status transition does NOT write an event", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();

    const eventsBefore = await getDealEvents(db, deal.id, wsA.id);
    const countBefore = eventsBefore.length;

    // Attempt invalid transition: lead -> funded
    await expect(
      updateDealStatus(db, scope, deal.id, "funded"),
    ).rejects.toThrow("Cannot transition");

    const eventsAfter = await getDealEvents(db, deal.id, wsA.id);
    expect(eventsAfter.length).toBe(countBefore); // No new events
  });

  it("failed assignDeal (user not in workspace) does NOT write an event", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();

    const eventsBefore = await getDealEvents(db, deal.id, wsA.id);
    const countBefore = eventsBefore.length;

    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    await expect(
      assignDeal(db, scope, deal.id, fakeUserId),
    ).rejects.toThrow("not found in this workspace");

    const eventsAfter = await getDealEvents(db, deal.id, wsA.id);
    expect(eventsAfter.length).toBe(countBefore);
  });
});

// ─── 4. Event ordering ──────────────────────────────────────────────────────

describe("event ordering", () => {
  it("events are returned newest-first with accurate timestamps", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");
    await updateDealStatus(db, scope, deal.id, "ready_to_submit");

    const events = await getDealEvents(db, deal.id, wsA.id);
    expect(events.length).toBe(3);

    // Most recent event first
    expect(events[0].eventType).toBe("status_changed");
    expect(events[events.length - 1].eventType).toBe("deal_created");

    // Timestamps must be descending
    for (let i = 0; i < events.length - 1; i++) {
      expect(events[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        events[i + 1].createdAt.getTime(),
      );
    }
  });

  it("timestamps are close to the current time (not stale)", async () => {
    const before = Date.now();
    const deal = await createTestDeal();
    const after = Date.now();

    const events = await getDealEvents(db, deal.id, wsA.id);
    const timestamp = events[0].createdAt.getTime();
    // Allow 5s tolerance for DB round-trip
    expect(timestamp).toBeGreaterThanOrEqual(before - 5000);
    expect(timestamp).toBeLessThanOrEqual(after + 5000);
  });
});

// ─── 5. Workspace scoping on events ─────────────────────────────────────────

describe("workspace scoping on events", () => {
  it("events from workspace A deals are invisible to workspace B queries", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");

    // wsA can see events
    const eventsA = await getDealEvents(db, deal.id, wsA.id);
    expect(eventsA.length).toBeGreaterThan(0);

    // wsB sees nothing
    const eventsB = await getDealEvents(db, deal.id, wsB.id);
    expect(eventsB).toHaveLength(0);
  });

  it("getUserEvents scoped to workspace — admin A events invisible via workspace B", async () => {
    await createTestDeal();

    const eventsA = await getUserEvents(db, adminA.id, wsA.id);
    expect(eventsA.length).toBeGreaterThan(0);

    const eventsB = await getUserEvents(db, adminA.id, wsB.id);
    expect(eventsB).toHaveLength(0);
  });

  it("getEventsByType scoped to workspace", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");

    const statusChangesA = await getEventsByType(db, wsA.id, "status_changed");
    expect(statusChangesA.length).toBeGreaterThan(0);

    // Verify all events belong to wsA
    for (const event of statusChangesA) {
      expect(event.workspaceId).toBe(wsA.id);
    }
  });
});

// ─── 6. Actor attribution ───────────────────────────────────────────────────

describe("actor attribution", () => {
  it("every event has the correct actor_id (the user who performed the action)", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");
    await assignDeal(db, scope, deal.id, repJake.id);

    const events = await getDealEvents(db, deal.id, wsA.id);
    for (const event of events) {
      expect(event.actorId).toBe(adminA.id);
      expect(event.actorName).toBe(adminA.name);
    }
  });

  it("actor attribution is correct when different users perform actions", async () => {
    // Create deal as adminA
    const deal = await createTestDeal({ assignedUserId: repEmily.id });

    // Emily performs a status change on her own deal
    const [emilyMembership] = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, repEmily.id));
    const emilyCtx: WorkspaceContext = {
      workspaceId: wsA.id,
      userId: repEmily.id,
      userRole: "rep",
      teamId: emilyMembership?.teamId ?? null,
    };
    const emilyScope = createWorkspaceScope(db, emilyCtx);
    await updateDealStatus(db, emilyScope, deal.id, "new_application");

    const events = await getDealEvents(db, deal.id, wsA.id);
    // Most recent event (status change) should be Emily
    const statusEvent = events.find((e) => e.eventType === "status_changed")!;
    expect(statusEvent.actorId).toBe(repEmily.id);
    expect(statusEvent.actorName).toBe("Emily Rodriguez");

    // Created event should be admin
    const createEvent = events.find((e) => e.eventType === "deal_created")!;
    expect(createEvent.actorId).toBe(adminA.id);
  });
});

// ─── 7. updateDeal with no actual changes — no-op ──────────────────────────

describe("updateDeal no-op behavior", () => {
  it("passing the same value as existing does NOT create an event", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();

    // Pass the same merchantName
    await updateDeal(db, scope, deal.id, {
      merchantName: deal.merchantName,
    });

    const events = await getDealEvents(db, deal.id, wsA.id);
    const updateEvents = events.filter((e) => e.eventType === "deal_updated");
    expect(updateEvents).toHaveLength(0);
  });

  it("passing undefined fields does NOT create an event", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();

    // Empty update — no fields specified
    const result = await updateDeal(db, scope, deal.id, {});

    expect(result.id).toBe(deal.id);
    const events = await getDealEvents(db, deal.id, wsA.id);
    const updateEvents = events.filter((e) => e.eventType === "deal_updated");
    expect(updateEvents).toHaveLength(0);
  });
});

// ─── 8. updateDeal with multiple field changes ─────────────────────────────

describe("updateDeal with multiple field changes", () => {
  it("records all changes in a single event", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();

    await updateDeal(db, scope, deal.id, {
      merchantName: "Multi-Change Corp",
      requestedAmount: "99999.99",
      notes: "New notes here",
    });

    const events = await getDealEvents(db, deal.id, wsA.id);
    const updateEvents = events.filter((e) => e.eventType === "deal_updated");
    expect(updateEvents).toHaveLength(1); // Single event, not 3

    const parsed = dealUpdatedMetadataSchema.parse(updateEvents[0].metadata);
    expect(parsed.changes.length).toBeGreaterThanOrEqual(3);

    const fieldNames = parsed.changes.map((c) => c.field);
    expect(fieldNames).toContain("merchant_name");
    expect(fieldNames).toContain("requested_amount");
    expect(fieldNames).toContain("notes");

    // Verify old/new for each change
    const nameChange = parsed.changes.find((c) => c.field === "merchant_name")!;
    expect(nameChange.old_value).toBe(deal.merchantName);
    expect(nameChange.new_value).toBe("Multi-Change Corp");

    const amountChange = parsed.changes.find((c) => c.field === "requested_amount")!;
    expect(amountChange.old_value).toBe("15000.00");
    expect(amountChange.new_value).toBe("99999.99");
  });
});

// ─── 9. Full deal lifecycle ─────────────────────────────────────────────────

describe("full deal lifecycle audit trail", () => {
  it("create -> assign -> status transitions -> delete produces complete timeline", async () => {
    // 1. Create
    const deal = await createTestDeal({ assignedUserId: repEmily.id });
    const scope = buildScopeA();

    // 2. Assign to Jake
    await assignDeal(db, scope, deal.id, repJake.id);

    // 3. Status transitions: lead -> new_application -> ready_to_submit -> submitted -> approved
    await updateDealStatus(db, scope, deal.id, "new_application");
    await updateDealStatus(db, scope, deal.id, "ready_to_submit");
    await updateDealStatus(db, scope, deal.id, "submitted");
    await updateDealStatus(db, scope, deal.id, "approved");

    // 4. Update a field
    await updateDeal(db, scope, deal.id, { notes: "Final notes before close" });

    // 5. More status transitions
    await updateDealStatus(db, scope, deal.id, "offer_accepted");
    await updateDealStatus(db, scope, deal.id, "contracts_out");
    await updateDealStatus(db, scope, deal.id, "funded");

    // Get full timeline
    const events = await getDealEvents(db, deal.id, wsA.id);

    // Verify event count: 1 created + 1 assigned + 7 status changes + 1 updated = 10
    expect(events).toHaveLength(10);

    // Verify correct order (newest first)
    // The last event (oldest) should be deal_created
    expect(events[events.length - 1].eventType).toBe("deal_created");
    // The first event (newest) should be status_changed to funded
    expect(events[0].eventType).toBe("status_changed");
    const lastMeta = statusChangedMetadataSchema.parse(events[0].metadata);
    expect(lastMeta.new_status).toBe("funded");

    // Verify all event types present
    const types = events.map((e) => e.eventType);
    expect(types).toContain("deal_created");
    expect(types).toContain("deal_assigned");
    expect(types).toContain("status_changed");
    expect(types).toContain("deal_updated");

    // Verify each event's metadata is Zod-parseable
    for (const event of events) {
      const schema = eventMetadataSchemas[event.eventType as EventType];
      const result = schema.safeParse(event.metadata);
      expect(result.success).toBe(true);
    }

    // Verify every event has correct actor and workspace
    for (const event of events) {
      expect(event.actorId).toBe(adminA.id);
      expect(event.workspaceId).toBe(wsA.id);
    }
  });

  it("lifecycle including soft-delete preserves all events", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");
    await softDeleteDeal(db, scope, deal.id);

    // Events should still be queryable after soft-delete
    const events = await getDealEvents(db, deal.id, wsA.id);
    expect(events).toHaveLength(3); // created + status_changed + deleted

    const types = events.map((e) => e.eventType);
    expect(types).toContain("deal_created");
    expect(types).toContain("status_changed");
    expect(types).toContain("deal_deleted");

    // Verify deleted event has label
    const deleteEvent = events.find((e) => e.eventType === "deal_deleted")!;
    const meta = dealDeletedMetadataSchema.parse(deleteEvent.metadata);
    expect(meta.status_at_deletion).toBe("new_application");
    expect(meta.status_at_deletion_label).toBe("New Application");
  });
});

// ─── 10. getUserEvents date filtering ───────────────────────────────────────

describe("getUserEvents date filtering", () => {
  it("returns events for today when filtered by today's date", async () => {
    await createTestDeal();

    const today = new Date();
    const eventsToday = await getUserEvents(db, adminA.id, wsA.id, today);
    expect(eventsToday.length).toBeGreaterThanOrEqual(1);

    // All events should have createdAt matching today
    for (const event of eventsToday) {
      const d = new Date(event.createdAt);
      expect(d.getFullYear()).toBe(today.getFullYear());
      expect(d.getMonth()).toBe(today.getMonth());
      expect(d.getDate()).toBe(today.getDate());
    }
  });

  it("returns empty array for a past date with no activity", async () => {
    const farPast = new Date("2020-01-01");
    const events = await getUserEvents(db, adminA.id, wsA.id, farPast);
    expect(events).toHaveLength(0);
  });

  it("returns empty array for a future date", async () => {
    const future = new Date("2099-12-31");
    const events = await getUserEvents(db, adminA.id, wsA.id, future);
    expect(events).toHaveLength(0);
  });

  it("without date filter returns all events for the user", async () => {
    await createTestDeal();
    const allEvents = await getUserEvents(db, adminA.id, wsA.id);
    expect(allEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Bonus: getEventsByType query capability ────────────────────────────────

describe("getEventsByType — query all status changes in a time window", () => {
  it("returns all status_changed events in workspace", async () => {
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");

    const statusChanges = await getEventsByType(db, wsA.id, "status_changed");
    expect(statusChanges.length).toBeGreaterThan(0);
    for (const event of statusChanges) {
      expect(event.eventType).toBe("status_changed");
      expect(event.workspaceId).toBe(wsA.id);
    }
  });

  it("can filter by time window (since/until)", async () => {
    const since = new Date();
    const deal = await createTestDeal();
    const scope = buildScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");

    const recentChanges = await getEventsByType(db, wsA.id, "status_changed", {
      since,
    });
    expect(recentChanges.length).toBeGreaterThanOrEqual(1);

    // All should be after 'since'
    for (const event of recentChanges) {
      expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(since.getTime() - 5000);
    }
  });

  it("returns empty for a time window with no events", async () => {
    const farPast = new Date("2020-01-01");
    const farPastEnd = new Date("2020-01-02");
    const events = await getEventsByType(db, wsA.id, "status_changed", {
      since: farPast,
      until: farPastEnd,
    });
    expect(events).toHaveLength(0);
  });

  it("can query all deal_assigned events to find deals assigned to a user", async () => {
    const deal = await createTestDeal({ assignedUserId: repEmily.id });
    const scope = buildScopeA();
    await assignDeal(db, scope, deal.id, repJake.id);

    const assignEvents = await getEventsByType(db, wsA.id, "deal_assigned");
    expect(assignEvents.length).toBeGreaterThan(0);

    // Find our specific assignment
    const ourEvent = assignEvents.find((e) => e.dealId === deal.id);
    expect(ourEvent).toBeDefined();
    const meta = dealAssignedMetadataSchema.parse(ourEvent!.metadata);
    expect(meta.new_user_id).toBe(repJake.id);
    expect(meta.new_user_name).toBe("Jake Thompson");
  });
});
