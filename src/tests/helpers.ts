import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, workspaces, teamMemberships } from "@/server/db/schema";
import type { WorkspaceContext } from "@/server/lib/workspace-scope";

export async function getWorkspaceByName(name: string) {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, name));
  if (!ws) throw new Error(`Workspace not found: ${name}`);
  return ws;
}

export async function getUserByRole(workspaceId: string, role: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.workspaceId, workspaceId));
  const user = rows.find((r) => r.role === role);
  if (!user) throw new Error(`No ${role} found for workspace: ${workspaceId}`);
  return user;
}

export async function getAdminForWorkspace(workspaceId: string) {
  return getUserByRole(workspaceId, "admin");
}

export async function getTeamIdForUser(userId: string): Promise<string | null> {
  const [membership] = await db
    .select()
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, userId));
  return membership?.teamId ?? null;
}

export function buildCtx(
  user: typeof users.$inferSelect,
  teamId: string | null,
): WorkspaceContext {
  return {
    workspaceId: user.workspaceId,
    userId: user.id,
    userRole: user.role,
    teamId,
  };
}
