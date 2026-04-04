import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, workspaces } from "@/server/db/schema";
import { SESSION_COOKIE_NAME, UUID_REGEX } from "@/server/lib/constants";

/**
 * GET /api/auth/users — List all users grouped by workspace (dev toolbar).
 *
 * SECURITY NOTE: This endpoint is intentionally unauthenticated because the
 * dev toolbar needs to populate the user switcher BEFORE any session exists.
 * This is a dev-only auth system — in production, this endpoint would be
 * removed entirely and replaced by proper auth (NextAuth, Clerk, etc.).
 *
 * The data exposed (names, emails, roles) contains no passwords or secrets.
 */
export async function GET() {
  // NOTE: For the dev toolbar, we return all workspaces so the developer can
  // switch personas. In production, this should ONLY return users from the
  // session user's workspace.
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      workspaceId: users.workspaceId,
      workspaceName: workspaces.name,
    })
    .from(users)
    .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
    .orderBy(workspaces.name, users.name);

  // Group by workspace
  const grouped: Record<
    string,
    { workspaceId: string; workspaceName: string; users: typeof rows }
  > = {};

  for (const row of rows) {
    if (!grouped[row.workspaceId]) {
      grouped[row.workspaceId] = {
        workspaceId: row.workspaceId,
        workspaceName: row.workspaceName,
        users: [],
      };
    }
    grouped[row.workspaceId].users.push(row);
  }

  return NextResponse.json({ workspaces: Object.values(grouped) });
}
