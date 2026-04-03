import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, workspaces, teamMemberships } from "@/server/db/schema";
import {
  createWorkspaceScope,
  type WorkspaceContext,
} from "@/server/lib/workspace-scope";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getWorkspaceByName(name: string) {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, name));
  if (!ws) throw new Error(`Workspace not found: ${name}`);
  return ws;
}

async function getAdminForWorkspace(workspaceId: string) {
  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.workspaceId, workspaceId))
    .then((rows) => rows.filter((r) => r.role === "admin"));
  if (!admin) throw new Error(`No admin found for workspace: ${workspaceId}`);
  return admin;
}

async function getTeamIdForUser(userId: string): Promise<string | null> {
  const [membership] = await db
    .select()
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, userId));
  return membership?.teamId ?? null;
}

function buildCtx(user: typeof users.$inferSelect, teamId: string | null): WorkspaceContext {
  return {
    workspaceId: user.workspaceId,
    userId: user.id,
    userRole: user.role,
    teamId,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("workspace isolation", () => {
  it("Workspace A admin sees only Workspace A deals", async () => {
    const wsA = await getWorkspaceByName("Apex Funding Brokers");
    const admin = await getAdminForWorkspace(wsA.id);
    const teamId = await getTeamIdForUser(admin.id);
    const scope = createWorkspaceScope(db, buildCtx(admin, teamId));

    const deals = await scope.queryDeals();
    expect(deals.length).toBeGreaterThan(0);
    for (const deal of deals) {
      expect(deal.workspaceId).toBe(wsA.id);
    }
  });

  it("Workspace B admin sees only Workspace B deals", async () => {
    const wsB = await getWorkspaceByName("Summit Capital Group");
    const admin = await getAdminForWorkspace(wsB.id);
    const teamId = await getTeamIdForUser(admin.id);
    const scope = createWorkspaceScope(db, buildCtx(admin, teamId));

    const deals = await scope.queryDeals();
    expect(deals.length).toBeGreaterThan(0);
    for (const deal of deals) {
      expect(deal.workspaceId).toBe(wsB.id);
    }
  });

  it("zero overlap between workspace deal sets", async () => {
    const wsA = await getWorkspaceByName("Apex Funding Brokers");
    const wsB = await getWorkspaceByName("Summit Capital Group");

    const adminA = await getAdminForWorkspace(wsA.id);
    const adminB = await getAdminForWorkspace(wsB.id);

    const teamIdA = await getTeamIdForUser(adminA.id);
    const teamIdB = await getTeamIdForUser(adminB.id);

    const scopeA = createWorkspaceScope(db, buildCtx(adminA, teamIdA));
    const scopeB = createWorkspaceScope(db, buildCtx(adminB, teamIdB));

    const dealsA = await scopeA.queryDeals();
    const dealsB = await scopeB.queryDeals();

    const idsA = new Set(dealsA.map((d) => d.id));
    const idsB = new Set(dealsB.map((d) => d.id));

    for (const id of idsA) {
      expect(idsB.has(id)).toBe(false);
    }
    for (const id of idsB) {
      expect(idsA.has(id)).toBe(false);
    }
  });

  it("Workspace A admin cannot find a Workspace B deal by ID", async () => {
    const wsA = await getWorkspaceByName("Apex Funding Brokers");
    const wsB = await getWorkspaceByName("Summit Capital Group");

    const adminA = await getAdminForWorkspace(wsA.id);
    const adminB = await getAdminForWorkspace(wsB.id);

    const teamIdA = await getTeamIdForUser(adminA.id);
    const teamIdB = await getTeamIdForUser(adminB.id);

    const scopeA = createWorkspaceScope(db, buildCtx(adminA, teamIdA));
    const scopeB = createWorkspaceScope(db, buildCtx(adminB, teamIdB));

    // Get a deal from Workspace B
    const dealsB = await scopeB.queryDeals();
    expect(dealsB.length).toBeGreaterThan(0);
    const dealBId = dealsB[0].id;

    // Workspace A admin should not be able to find it
    await expect(scopeA.findDeal(dealBId)).rejects.toThrow("Deal not found");
  });
});
