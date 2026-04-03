import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  users,
  workspaces,
  deals,
  teamMemberships,
} from "@/server/db/schema";
import {
  createWorkspaceScope,
  type WorkspaceContext,
} from "@/server/lib/workspace-scope";
import {
  createDeal,
  updateDealStatus,
  softDeleteDeal,
  assignDeal,
  listDeals,
} from "@/server/services/deals";
import { getDealEvents } from "@/server/services/activity-log";
import type { DealStatus } from "@/server/lib/status-machine";

// ─── Test context ───────────────────────────────────────────────────────────

let wsA: typeof workspaces.$inferSelect;
let adminA: typeof users.$inferSelect;
let repEmily: typeof users.$inferSelect;
let repJake: typeof users.$inferSelect;
let adminTeamId: string | null;

beforeAll(async () => {
  // Fetch workspace A
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, "Apex Funding Brokers"));
  if (!ws) throw new Error("Workspace A not found — run seed first");
  wsA = ws;

  // Fetch users
  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.workspaceId, wsA.id));

  adminA = allUsers.find((u) => u.role === "admin")!;
  repEmily = allUsers.find((u) => u.name === "Emily Rodriguez")!;
  repJake = allUsers.find((u) => u.name === "Jake Thompson")!;

  if (!adminA || !repEmily || !repJake) {
    throw new Error("Required seed users not found");
  }

  // Get admin's team ID
  const [membership] = await db
    .select()
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, adminA.id));
  adminTeamId = membership?.teamId ?? null;
});

function buildAdminCtx(): WorkspaceContext {
  return {
    workspaceId: wsA.id,
    userId: adminA.id,
    userRole: adminA.role,
    teamId: adminTeamId,
  };
}

function buildAdminScope() {
  return createWorkspaceScope(db, buildAdminCtx());
}

// ─── Helper: create a fresh test deal ───────────────────────────────────────

async function createTestDeal(overrides?: {
  status?: DealStatus;
  assignedUserId?: string;
}) {
  const ctx = buildAdminCtx();
  const deal = await createDeal(db, ctx, {
    merchantName: `Test Merchant ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    merchantEmail: "test@example.com",
    requestedAmount: "50000.00",
    assignedUserId: overrides?.assignedUserId ?? repEmily.id,
    status: overrides?.status ?? "lead",
  });
  return deal;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("deal CRUD + activity log", () => {
  it("creates a deal and logs a deal_created event", async () => {
    const deal = await createTestDeal();

    expect(deal).toBeDefined();
    expect(deal.merchantName).toContain("Test Merchant");
    expect(deal.status).toBe("lead");
    expect(deal.workspaceId).toBe(wsA.id);

    // Verify deal_created event
    const events = await getDealEvents(db, deal.id, wsA.id);
    const createdEvent = events.find((e) => e.eventType === "deal_created");
    expect(createdEvent).toBeDefined();
    expect(createdEvent!.actorId).toBe(adminA.id);
    expect((createdEvent!.metadata as Record<string, unknown>).merchant_name).toBe(
      deal.merchantName,
    );
  });

  it("updates deal status through a valid transition and logs status_changed event", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScope();

    const updated = await updateDealStatus(db, scope, deal.id, "new_application");
    expect(updated.status).toBe("new_application");

    // Verify status_changed event
    const events = await getDealEvents(db, deal.id, wsA.id);
    const statusEvent = events.find((e) => e.eventType === "status_changed");
    expect(statusEvent).toBeDefined();
    const metadata = statusEvent!.metadata as Record<string, unknown>;
    expect(metadata.old_status).toBe("lead");
    expect(metadata.new_status).toBe("new_application");
  });

  it("rejects invalid transition Lead → Funded with descriptive error", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScope();

    await expect(
      updateDealStatus(db, scope, deal.id, "funded"),
    ).rejects.toThrow("Cannot transition from 'Lead' to 'Funded'");
  });

  it("walks a deal through Lead → New Application → Ready to Submit → Submitted → Approved and logs 4 status_changed events", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScope();

    await updateDealStatus(db, scope, deal.id, "new_application");
    await updateDealStatus(db, scope, deal.id, "ready_to_submit");
    await updateDealStatus(db, scope, deal.id, "submitted");
    await updateDealStatus(db, scope, deal.id, "approved");

    // Verify 4 status_changed events accumulated
    const events = await getDealEvents(db, deal.id, wsA.id);
    const statusEvents = events.filter((e) => e.eventType === "status_changed");
    expect(statusEvents).toHaveLength(4);
  });

  it("soft-deletes a deal — disappears from list queries but row still exists", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScope();

    await softDeleteDeal(db, scope, deal.id);

    // Should not appear in list queries
    const listedDeals = await listDeals(scope);
    const found = listedDeals.find((d) => d.id === deal.id);
    expect(found).toBeUndefined();

    // But the row should still exist in the database (with deleted_at set)
    const [rawDeal] = await db
      .select()
      .from(deals)
      .where(eq(deals.id, deal.id));
    expect(rawDeal).toBeDefined();
    expect(rawDeal.deletedAt).not.toBeNull();
  });

  it("assigns a deal to a different user and logs deal_assigned event", async () => {
    const deal = await createTestDeal({ assignedUserId: repEmily.id });
    const scope = buildAdminScope();

    const updated = await assignDeal(db, scope, deal.id, repJake.id);
    expect(updated.assignedUserId).toBe(repJake.id);

    // Verify deal_assigned event
    const events = await getDealEvents(db, deal.id, wsA.id);
    const assignedEvent = events.find((e) => e.eventType === "deal_assigned");
    expect(assignedEvent).toBeDefined();
    const metadata = assignedEvent!.metadata as Record<string, unknown>;
    expect(metadata.old_user_id).toBe(repEmily.id);
    expect(metadata.new_user_id).toBe(repJake.id);
    expect(metadata.old_user_name).toBe("Emily Rodriguez");
    expect(metadata.new_user_name).toBe("Jake Thompson");
  });
});
