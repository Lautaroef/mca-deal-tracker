import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, workspaces } from "@/server/db/schema";
import { SESSION_COOKIE_NAME, UUID_REGEX } from "@/server/lib/constants";

/**
 * GET /api/auth/users — List all users grouped by workspace (dev toolbar).
 *
 * SECURITY: In a production system, this must be scoped to the current user's
 * workspace. For the dev toolbar, we need all workspaces visible so the
 * developer can switch between personas. This is acceptable ONLY because
 * this is a dev-only auth system.
 *
 * Defense-in-depth: we still require a valid session cookie. An unauthenticated
 * request gets a 401 instead of the full user list.
 */
export async function GET() {
  // Require authentication — don't expose user list to unauthenticated requests
  const cookieStore = await cookies();
  const sessionUserId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionUserId || !UUID_REGEX.test(sessionUserId)) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // Verify the session user exists
  const [sessionUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, sessionUserId))
    .limit(1);

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

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
