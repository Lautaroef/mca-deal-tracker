import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { users, teamMemberships } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE_NAME, UUID_REGEX } from "@/server/lib/constants";

/** POST /api/auth — Set the current user (dev auth) */
export async function POST(req: Request) {
  const body = await req.json();
  const userId = body?.userId;

  if (!userId || typeof userId !== "string" || !UUID_REGEX.test(userId)) {
    return NextResponse.json(
      { error: "userId is required and must be a valid UUID" },
      { status: 400 },
    );
  }

  // Verify the user exists
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No maxAge — session cookie, cleared on browser close
  });

  return NextResponse.json({ success: true, userId });
}

/** GET /api/auth — Get the current user from cookie */
export async function GET() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!userId) {
    return NextResponse.json({ user: null });
  }

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      workspaceId: users.workspaceId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ user: null });
  }

  const [membership] = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, row.id))
    .limit(1);

  return NextResponse.json({
    user: {
      ...row,
      teamId: membership?.teamId ?? null,
    },
  });
}

/** DELETE /api/auth — Clear the session cookie */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  return NextResponse.json({ success: true });
}
