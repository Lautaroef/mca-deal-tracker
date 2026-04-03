import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { users, workspaces } from "@/server/db/schema";
import { eq } from "drizzle-orm";

/** GET /api/auth/users — List all users grouped by workspace (dev toolbar) */
export async function GET() {
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
