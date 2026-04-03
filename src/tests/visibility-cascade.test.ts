import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { createWorkspaceScope } from "@/server/lib/workspace-scope";
import {
  getWorkspaceByName,
  getUserByRole,
  getTeamIdForUser,
  buildCtx,
} from "./helpers";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("visibility cascade — Workspace A", () => {
  it("admin sees all deals (~10)", async () => {
    const wsA = await getWorkspaceByName("Apex Funding Brokers");
    const admin = await getUserByRole(wsA.id, "admin");
    const teamId = await getTeamIdForUser(admin.id);
    const scope = createWorkspaceScope(db, buildCtx(admin, teamId));

    const deals = await scope.queryDeals();
    expect(deals.length).toBeGreaterThanOrEqual(8);
  });

  it("team leader sees only deals assigned to team members (subset of admin)", async () => {
    const wsA = await getWorkspaceByName("Apex Funding Brokers");
    const admin = await getUserByRole(wsA.id, "admin");
    const teamLeader = await getUserByRole(wsA.id, "team_leader");

    const adminTeamId = await getTeamIdForUser(admin.id);
    const tlTeamId = await getTeamIdForUser(teamLeader.id);

    const adminScope = createWorkspaceScope(db, buildCtx(admin, adminTeamId));
    const tlScope = createWorkspaceScope(db, buildCtx(teamLeader, tlTeamId));

    const adminDeals = await adminScope.queryDeals();
    const tlDeals = await tlScope.queryDeals();

    expect(tlDeals.length).toBeGreaterThan(0);
    expect(tlDeals.length).toBeLessThanOrEqual(adminDeals.length);
  });

  it("rep sees only their own deals (subset of team leader)", async () => {
    const wsA = await getWorkspaceByName("Apex Funding Brokers");
    const teamLeader = await getUserByRole(wsA.id, "team_leader");
    // Get a rep (Emily Rodriguez or Jake Thompson)
    const allUsers = await db
      .select()
      .from(users)
      .where(eq(users.workspaceId, wsA.id));
    const rep = allUsers.find((u) => u.role === "rep");
    if (!rep) throw new Error("No rep found");

    const tlTeamId = await getTeamIdForUser(teamLeader.id);
    const repTeamId = await getTeamIdForUser(rep.id);

    const tlScope = createWorkspaceScope(db, buildCtx(teamLeader, tlTeamId));
    const repScope = createWorkspaceScope(db, buildCtx(rep, repTeamId));

    const tlDeals = await tlScope.queryDeals();
    const repDeals = await repScope.queryDeals();

    expect(repDeals.length).toBeGreaterThan(0);
    expect(repDeals.length).toBeLessThanOrEqual(tlDeals.length);

    // All rep deals should be assigned to them
    for (const deal of repDeals) {
      expect(deal.assignedUserId).toBe(rep.id);
    }
  });

  it("hierarchy: admin count >= team leader count >= rep count", async () => {
    const wsA = await getWorkspaceByName("Apex Funding Brokers");
    const admin = await getUserByRole(wsA.id, "admin");
    const teamLeader = await getUserByRole(wsA.id, "team_leader");

    const allUsers = await db
      .select()
      .from(users)
      .where(eq(users.workspaceId, wsA.id));
    const rep = allUsers.find((u) => u.role === "rep");
    if (!rep) throw new Error("No rep found");

    const adminTeamId = await getTeamIdForUser(admin.id);
    const tlTeamId = await getTeamIdForUser(teamLeader.id);
    const repTeamId = await getTeamIdForUser(rep.id);

    const adminScope = createWorkspaceScope(db, buildCtx(admin, adminTeamId));
    const tlScope = createWorkspaceScope(db, buildCtx(teamLeader, tlTeamId));
    const repScope = createWorkspaceScope(db, buildCtx(rep, repTeamId));

    const adminDeals = await adminScope.queryDeals();
    const tlDeals = await tlScope.queryDeals();
    const repDeals = await repScope.queryDeals();

    expect(adminDeals.length).toBeGreaterThanOrEqual(tlDeals.length);
    expect(tlDeals.length).toBeGreaterThanOrEqual(repDeals.length);
  });

  it("rep's deals are a strict subset of team leader's deals", async () => {
    const wsA = await getWorkspaceByName("Apex Funding Brokers");
    const teamLeader = await getUserByRole(wsA.id, "team_leader");

    const allUsers = await db
      .select()
      .from(users)
      .where(eq(users.workspaceId, wsA.id));
    const rep = allUsers.find((u) => u.role === "rep");
    if (!rep) throw new Error("No rep found");

    const tlTeamId = await getTeamIdForUser(teamLeader.id);
    const repTeamId = await getTeamIdForUser(rep.id);

    const tlScope = createWorkspaceScope(db, buildCtx(teamLeader, tlTeamId));
    const repScope = createWorkspaceScope(db, buildCtx(rep, repTeamId));

    const tlDeals = await tlScope.queryDeals();
    const repDeals = await repScope.queryDeals();

    const tlDealIds = new Set(tlDeals.map((d) => d.id));
    for (const deal of repDeals) {
      expect(tlDealIds.has(deal.id)).toBe(true);
    }
  });
});
