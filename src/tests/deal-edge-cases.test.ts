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
  updateDeal,
  updateDealStatus,
  softDeleteDeal,
  assignDeal,
  listDeals,
} from "@/server/services/deals";
import { getDealEvents } from "@/server/services/activity-log";
import type { DealStatus } from "@/server/lib/status-machine";

// ─── Test context ───────────────────────────────────────────────────────────

let wsA: typeof workspaces.$inferSelect;
let wsB: typeof workspaces.$inferSelect;
let adminA: typeof users.$inferSelect;
let repEmily: typeof users.$inferSelect;
let repJake: typeof users.$inferSelect;
let teamLeaderA: typeof users.$inferSelect;
let adminB: typeof users.$inferSelect;
let repLisa: typeof users.$inferSelect;
let adminTeamIdA: string | null;
let tlTeamId: string | null;

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
  teamLeaderA = allUsersA.find((u) => u.role === "team_leader")!;
  repEmily = allUsersA.find((u) => u.name === "Emily Rodriguez")!;
  repJake = allUsersA.find((u) => u.name === "Jake Thompson")!;

  const allUsersB = await db
    .select()
    .from(users)
    .where(eq(users.workspaceId, wsB.id));
  adminB = allUsersB.find((u) => u.role === "admin")!;
  repLisa = allUsersB.find((u) => u.name === "Lisa Wang")!;

  const [membershipA] = await db
    .select()
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, adminA.id));
  adminTeamIdA = membershipA?.teamId ?? null;

  const [membershipTL] = await db
    .select()
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, teamLeaderA.id));
  tlTeamId = membershipTL?.teamId ?? null;
});

function buildAdminCtxA(): WorkspaceContext {
  return {
    workspaceId: wsA.id,
    userId: adminA.id,
    userRole: adminA.role,
    teamId: adminTeamIdA,
  };
}

function buildAdminScopeA() {
  return createWorkspaceScope(db, buildAdminCtxA());
}

async function createTestDeal(overrides?: {
  status?: DealStatus;
  assignedUserId?: string;
}) {
  return createDeal(db, buildAdminCtxA(), {
    merchantName: `EdgeCase Test ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    merchantEmail: "test@edge.com",
    requestedAmount: "25000.00",
    assignedUserId: overrides?.assignedUserId ?? repEmily.id,
    status: overrides?.status ?? "lead",
  });
}

// ─── Soft delete edge cases ─────────────────────────────────────────────────

describe("soft delete edge cases", () => {
  it("soft-deleted deal is invisible to findDeal", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();
    await softDeleteDeal(db, scope, deal.id);

    await expect(scope.findDeal(deal.id)).rejects.toThrow("Deal not found");
  });

  it("soft-deleted deal is invisible to listDeals", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();
    await softDeleteDeal(db, scope, deal.id);

    const listed = await listDeals(scope);
    const found = listed.find((d) => d.id === deal.id);
    expect(found).toBeUndefined();
  });

  it("cannot transition status on a soft-deleted deal (findDeal throws)", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();
    await softDeleteDeal(db, scope, deal.id);

    await expect(
      updateDealStatus(db, scope, deal.id, "new_application"),
    ).rejects.toThrow("Deal not found");
  });

  it("cannot update fields on a soft-deleted deal (findDeal throws)", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();
    await softDeleteDeal(db, scope, deal.id);

    await expect(
      updateDeal(db, scope, deal.id, { merchantName: "Updated Name" }),
    ).rejects.toThrow("Deal not found");
  });

  it("cannot assign a soft-deleted deal (findDeal throws)", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();
    await softDeleteDeal(db, scope, deal.id);

    await expect(
      assignDeal(db, scope, deal.id, repJake.id),
    ).rejects.toThrow("Deal not found");
  });

  it("soft delete logs a deal_deleted event with correct metadata", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();
    await softDeleteDeal(db, scope, deal.id);

    const events = await getDealEvents(db, deal.id, wsA.id);
    const deleteEvent = events.find((e) => e.eventType === "deal_deleted");
    expect(deleteEvent).toBeDefined();
    const metadata = deleteEvent!.metadata as Record<string, unknown>;
    expect(metadata.merchant_name).toBe(deal.merchantName);
    expect(metadata.status_at_deletion).toBe("lead");
  });

  it("soft-deleted deal row still exists in the database with deleted_at set", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();
    await softDeleteDeal(db, scope, deal.id);

    const [raw] = await db
      .select()
      .from(deals)
      .where(eq(deals.id, deal.id));
    expect(raw).toBeDefined();
    expect(raw.deletedAt).not.toBeNull();
  });

  it("cannot soft-delete the same deal twice (second attempt throws)", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();
    await softDeleteDeal(db, scope, deal.id);

    // Second attempt should fail because findDeal won't find it
    await expect(
      softDeleteDeal(db, scope, deal.id),
    ).rejects.toThrow("Deal not found");
  });
});

// ─── Update deal (non-status fields) ────────────────────────────────────────

describe("updateDeal — field updates + activity log", () => {
  it("updates merchantName and logs a deal_updated event with old/new values", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();

    const updated = await updateDeal(db, scope, deal.id, {
      merchantName: "Renamed Merchant",
    });
    expect(updated.merchantName).toBe("Renamed Merchant");

    const events = await getDealEvents(db, deal.id, wsA.id);
    const updateEvent = events.find((e) => e.eventType === "deal_updated");
    expect(updateEvent).toBeDefined();
    const metadata = updateEvent!.metadata as {
      changes: Array<{ field: string; old_value: string | null; new_value: string | null }>;
    };
    expect(metadata.changes).toHaveLength(1);
    expect(metadata.changes[0].field).toBe("merchant_name");
    expect(metadata.changes[0].old_value).toBe(deal.merchantName);
    expect(metadata.changes[0].new_value).toBe("Renamed Merchant");
  });

  it("returns the existing deal unchanged when no fields actually change (no-op)", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();

    // Pass the same merchantName — nothing changes
    const result = await updateDeal(db, scope, deal.id, {
      merchantName: deal.merchantName,
    });
    expect(result.id).toBe(deal.id);
    expect(result.merchantName).toBe(deal.merchantName);

    // No deal_updated event should be logged
    const events = await getDealEvents(db, deal.id, wsA.id);
    const updateEvents = events.filter((e) => e.eventType === "deal_updated");
    expect(updateEvents).toHaveLength(0);
  });

  it("updates multiple fields in a single call", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();

    const updated = await updateDeal(db, scope, deal.id, {
      merchantName: "Multi Update Corp",
      requestedAmount: "99999.99",
      notes: "Updated notes",
    });
    expect(updated.merchantName).toBe("Multi Update Corp");
    expect(updated.requestedAmount).toBe("99999.99");
    expect(updated.notes).toBe("Updated notes");

    const events = await getDealEvents(db, deal.id, wsA.id);
    const updateEvent = events.find((e) => e.eventType === "deal_updated");
    const metadata = updateEvent!.metadata as {
      changes: Array<{ field: string; old_value: string | null; new_value: string | null }>;
    };
    expect(metadata.changes.length).toBeGreaterThanOrEqual(3);
  });

  it("can clear nullable fields by passing null", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();

    const updated = await updateDeal(db, scope, deal.id, {
      merchantEmail: null,
      notes: null,
    });
    expect(updated.merchantEmail).toBeNull();
    expect(updated.notes).toBeNull();
  });
});

// ─── Assignment edge cases ──────────────────────────────────────────────────

describe("assignment edge cases", () => {
  it("assigning to a non-existent user throws", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();
    const fakeUserId = "00000000-0000-0000-0000-000000000000";

    await expect(
      assignDeal(db, scope, deal.id, fakeUserId),
    ).rejects.toThrow("not found in this workspace");
  });

  it("assigning to the same user is allowed (no-op assignment succeeds)", async () => {
    const deal = await createTestDeal({ assignedUserId: repEmily.id });
    const scope = buildAdminScopeA();

    // Re-assign to the same user — should not throw
    const updated = await assignDeal(db, scope, deal.id, repEmily.id);
    expect(updated.assignedUserId).toBe(repEmily.id);
  });

  it("assigning logs deal_assigned event with correct old/new user info", async () => {
    const deal = await createTestDeal({ assignedUserId: repEmily.id });
    const scope = buildAdminScopeA();

    await assignDeal(db, scope, deal.id, repJake.id);
    const events = await getDealEvents(db, deal.id, wsA.id);
    const assignedEvent = events.find((e) => e.eventType === "deal_assigned");
    expect(assignedEvent).toBeDefined();
    const metadata = assignedEvent!.metadata as Record<string, unknown>;
    expect(metadata.old_user_name).toBe("Emily Rodriguez");
    expect(metadata.new_user_name).toBe("Jake Thompson");
  });

  it("assigning to a user from a different workspace throws", async () => {
    const deal = await createTestDeal();
    const scope = buildAdminScopeA();

    // repLisa is in wsB — assignDeal checks that the target user is in the same workspace
    await expect(
      assignDeal(db, scope, deal.id, repLisa.id),
    ).rejects.toThrow("not found in this workspace");
  });
});

// ─── Status transition edge cases at service level ──────────────────────────

describe("status transition edge cases (service level)", () => {
  it("same-status transition (lead → lead) throws at service level", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScopeA();

    await expect(
      updateDealStatus(db, scope, deal.id, "lead"),
    ).rejects.toThrow("Cannot transition");
  });

  it("transition on non-existent deal throws 'Deal not found'", async () => {
    const scope = buildAdminScopeA();
    const fakeDealId = "00000000-0000-0000-0000-000000000000";

    await expect(
      updateDealStatus(db, scope, fakeDealId, "new_application"),
    ).rejects.toThrow("Deal not found");
  });

  it("funded → any status throws terminal error at service level", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScopeA();

    // Walk to funded
    await updateDealStatus(db, scope, deal.id, "new_application");
    await updateDealStatus(db, scope, deal.id, "ready_to_submit");
    await updateDealStatus(db, scope, deal.id, "submitted");
    await updateDealStatus(db, scope, deal.id, "approved");
    await updateDealStatus(db, scope, deal.id, "offer_accepted");
    await updateDealStatus(db, scope, deal.id, "contracts_out");
    await updateDealStatus(db, scope, deal.id, "funded");

    await expect(
      updateDealStatus(db, scope, deal.id, "dead"),
    ).rejects.toThrow("terminal status");
  });

  it("dead → lead (resurrect) succeeds at service level", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");
    await updateDealStatus(db, scope, deal.id, "ready_to_submit");
    await updateDealStatus(db, scope, deal.id, "dead");

    const resurrected = await updateDealStatus(db, scope, deal.id, "lead");
    expect(resurrected.status).toBe("lead");
  });

  it("backward transition (approved → ready_to_submit resubmission) succeeds", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");
    await updateDealStatus(db, scope, deal.id, "ready_to_submit");
    await updateDealStatus(db, scope, deal.id, "submitted");
    await updateDealStatus(db, scope, deal.id, "approved");

    const resubmitted = await updateDealStatus(
      db,
      scope,
      deal.id,
      "ready_to_submit",
    );
    expect(resubmitted.status).toBe("ready_to_submit");
  });

  it("backward transition (offer_accepted → approved) succeeds", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScopeA();
    await updateDealStatus(db, scope, deal.id, "new_application");
    await updateDealStatus(db, scope, deal.id, "ready_to_submit");
    await updateDealStatus(db, scope, deal.id, "submitted");
    await updateDealStatus(db, scope, deal.id, "approved");
    await updateDealStatus(db, scope, deal.id, "offer_accepted");

    const backToApproved = await updateDealStatus(
      db,
      scope,
      deal.id,
      "approved",
    );
    expect(backToApproved.status).toBe("approved");
  });
});

// ─── Concurrent operations ──────────────────────────────────────────────────

describe("concurrent operations", () => {
  it("two sequential transitions on the same deal both succeed (second sees updated state)", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScopeA();

    const first = await updateDealStatus(db, scope, deal.id, "new_application");
    expect(first.status).toBe("new_application");

    const second = await updateDealStatus(
      db,
      scope,
      deal.id,
      "ready_to_submit",
    );
    expect(second.status).toBe("ready_to_submit");

    // Verify the final state in DB
    const final = await scope.findDeal(deal.id);
    expect(final.status).toBe("ready_to_submit");
  });

  it("parallel create operations produce distinct deals", async () => {
    const [deal1, deal2] = await Promise.all([
      createTestDeal(),
      createTestDeal(),
    ]);
    expect(deal1.id).not.toBe(deal2.id);
    expect(deal1.merchantName).not.toBe(deal2.merchantName);
  });
});

// ─── Workspace scope edge cases ─────────────────────────────────────────────

describe("workspace scope edge cases", () => {
  it("team leader without a team sees only their own deals", async () => {
    // Create a context where team leader has no teamId
    const ctx: WorkspaceContext = {
      workspaceId: wsA.id,
      userId: teamLeaderA.id,
      userRole: "team_leader",
      teamId: null, // no team
    };
    const scope = createWorkspaceScope(db, ctx);

    const visibleDeals = await scope.queryDeals();
    // Should only see deals assigned to themselves
    for (const deal of visibleDeals) {
      expect(deal.assignedUserId).toBe(teamLeaderA.id);
    }
  });

  it("querying with a non-existent workspace ID returns zero deals", async () => {
    const ctx: WorkspaceContext = {
      workspaceId: "00000000-0000-0000-0000-000000000000",
      userId: adminA.id,
      userRole: "admin",
      teamId: null,
    };
    const scope = createWorkspaceScope(db, ctx);
    const visibleDeals = await scope.queryDeals();
    expect(visibleDeals).toHaveLength(0);
  });

  it("findDeal throws when deal exists but in a different workspace", async () => {
    // Create a deal in wsA
    const deal = await createTestDeal();

    // Try to find it from wsB context
    const ctxB: WorkspaceContext = {
      workspaceId: wsB.id,
      userId: adminB.id,
      userRole: "admin",
      teamId: null,
    };
    const scopeB = createWorkspaceScope(db, ctxB);

    await expect(scopeB.findDeal(deal.id)).rejects.toThrow("Deal not found");
  });

  it("rep cannot see deals assigned to another rep", async () => {
    // Create a deal assigned to Emily
    const deal = await createTestDeal({ assignedUserId: repEmily.id });

    // Jake's scope should not see it
    const [jakeMembership] = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, repJake.id));
    const jakeCtx: WorkspaceContext = {
      workspaceId: wsA.id,
      userId: repJake.id,
      userRole: "rep",
      teamId: jakeMembership?.teamId ?? null,
    };
    const jakeScope = createWorkspaceScope(db, jakeCtx);

    await expect(jakeScope.findDeal(deal.id)).rejects.toThrow("Deal not found");
  });

  it("admin can see deals assigned to any user in the workspace", async () => {
    const dealEmily = await createTestDeal({ assignedUserId: repEmily.id });
    const dealJake = await createTestDeal({ assignedUserId: repJake.id });
    const scope = buildAdminScopeA();

    const foundEmily = await scope.findDeal(dealEmily.id);
    const foundJake = await scope.findDeal(dealJake.id);
    expect(foundEmily.id).toBe(dealEmily.id);
    expect(foundJake.id).toBe(dealJake.id);
  });

  it("team leader sees deals assigned to all team members", async () => {
    const dealEmily = await createTestDeal({ assignedUserId: repEmily.id });
    const dealJake = await createTestDeal({ assignedUserId: repJake.id });

    const tlCtx: WorkspaceContext = {
      workspaceId: wsA.id,
      userId: teamLeaderA.id,
      userRole: "team_leader",
      teamId: tlTeamId,
    };
    const tlScope = createWorkspaceScope(db, tlCtx);

    const foundEmily = await tlScope.findDeal(dealEmily.id);
    const foundJake = await tlScope.findDeal(dealJake.id);
    expect(foundEmily.id).toBe(dealEmily.id);
    expect(foundJake.id).toBe(dealJake.id);
  });
});

// ─── Role-based access behavior (documentation tests) ───────────────────────

describe("role-based access — service layer behavior", () => {
  it("a rep CAN create a deal (service layer has no role check on create)", async () => {
    // createDeal takes a WorkspaceContext, not a scope — it doesn't check role
    const repCtx: WorkspaceContext = {
      workspaceId: wsA.id,
      userId: repEmily.id,
      userRole: "rep",
      teamId: null,
    };

    const deal = await createDeal(db, repCtx, {
      merchantName: `Rep Created ${Date.now()}`,
      requestedAmount: "5000.00",
      assignedUserId: repEmily.id,
      status: "lead",
    });
    expect(deal).toBeDefined();
    expect(deal.workspaceId).toBe(wsA.id);
  });

  it("a rep CAN assign their own deal to someone else via service layer", async () => {
    const deal = await createTestDeal({ assignedUserId: repEmily.id });

    // Rep Emily's scope
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

    // Emily can see her own deal, so she can assign it
    const updated = await assignDeal(db, emilyScope, deal.id, repJake.id);
    expect(updated.assignedUserId).toBe(repJake.id);
  });

  it("a rep CANNOT assign a deal they cannot see (another rep's deal)", async () => {
    const deal = await createTestDeal({ assignedUserId: repJake.id });

    // Rep Emily's scope — she can't see Jake's deal
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

    await expect(
      assignDeal(db, emilyScope, deal.id, repEmily.id),
    ).rejects.toThrow("Deal not found");
  });

  it("a rep CANNOT update status on a deal they cannot see", async () => {
    const deal = await createTestDeal({ assignedUserId: repJake.id });

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

    await expect(
      updateDealStatus(db, emilyScope, deal.id, "new_application"),
    ).rejects.toThrow("Deal not found");
  });
});
