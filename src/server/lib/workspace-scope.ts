import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { deals, teamMemberships } from "@/server/db/schema";
import type { Database } from "@/server/db";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "team_leader" | "rep";

export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  userRole: UserRole;
  teamId: string | null;
}

export interface WorkspaceScope {
  /** Query all deals visible to this user (workspace-scoped, role-filtered, soft-delete excluded). */
  queryDeals: () => Promise<(typeof deals.$inferSelect)[]>;
  /** Find a specific deal by ID within this workspace (throws if not found or not visible). */
  findDeal: (dealId: string) => Promise<typeof deals.$inferSelect>;
  /** The raw workspace + soft-delete filter condition, for composing custom queries. */
  workspaceFilter: () => SQL;
  /** The full visibility filter (workspace + role + soft-delete), for composing custom queries. */
  visibilityFilter: () => Promise<SQL>;
  /** The workspace context this scope was created with. */
  ctx: WorkspaceContext;
}

// ─── Implementation ──────────────────────────────────────────────────────────

export function createWorkspaceScope(
  db: Database,
  ctx: WorkspaceContext,
): WorkspaceScope {
  /**
   * Base filter: workspace_id matches AND deleted_at is null.
   * This is the minimum filter applied to every deal query.
   */
  function workspaceFilter(): SQL {
    return and(
      eq(deals.workspaceId, ctx.workspaceId),
      isNull(deals.deletedAt),
    )!;
  }

  /**
   * Build the role-based visibility filter on top of the workspace filter.
   * - Admin: sees all deals in the workspace
   * - Team Leader: sees deals assigned to any member of their team
   * - Rep: sees only deals assigned to themselves
   */
  async function visibilityFilter(): Promise<SQL> {
    const base = workspaceFilter();

    switch (ctx.userRole) {
      case "admin":
        // Admin sees everything in the workspace
        return base;

      case "team_leader": {
        if (!ctx.teamId) {
          // Team leader without a team — fall back to seeing only own deals
          return and(base, eq(deals.assignedUserId, ctx.userId))!;
        }

        // Fetch all user IDs in this team
        const members = await db
          .select({ userId: teamMemberships.userId })
          .from(teamMemberships)
          .where(eq(teamMemberships.teamId, ctx.teamId));

        const memberIds = members.map((m) => m.userId);

        // Ensure the leader themselves is included (they may not be in team_memberships)
        if (!memberIds.includes(ctx.userId)) {
          memberIds.push(ctx.userId);
        }

        return and(base, inArray(deals.assignedUserId, memberIds))!;
      }

      case "rep":
        return and(base, eq(deals.assignedUserId, ctx.userId))!;
    }
  }

  async function queryDeals() {
    const filter = await visibilityFilter();
    return db.select().from(deals).where(filter).orderBy(deals.createdAt);
  }

  async function findDeal(dealId: string) {
    const filter = await visibilityFilter();
    const rows = await db
      .select()
      .from(deals)
      .where(and(filter, eq(deals.id, dealId)));

    const deal = rows[0];
    if (!deal) {
      throw new Error(`Deal not found: ${dealId}`);
    }
    return deal;
  }

  return {
    queryDeals,
    findDeal,
    workspaceFilter,
    visibilityFilter,
    ctx,
  };
}
