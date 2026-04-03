import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { db } from "@/server/db";
import { users, teamMemberships } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { createWorkspaceScope, type UserRole } from "@/server/lib/workspace-scope";
import { SESSION_COOKIE_NAME, UUID_REGEX } from "@/server/lib/constants";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  workspaceId: string;
  teamId: string | null;
};

type Context = {
  user: SessionUser | null;
};

export async function createTRPCContext(req: Request): Promise<Context> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, rest.join("=")];
    }),
  );

  const userId = cookies[SESSION_COOKIE_NAME];
  if (!userId || !UUID_REGEX.test(userId)) {
    return { user: null };
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
    return { user: null };
  }

  // Look up the user's team membership
  const [membership] = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, row.id))
    .limit(1);

  return {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      workspaceId: row.workspaceId,
      teamId: membership?.teamId ?? null,
    },
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource.",
    });
  }
  return next({ ctx: { user: ctx.user } });
});

export const workspaceProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const scope = createWorkspaceScope(db, {
      workspaceId: ctx.user.workspaceId,
      userId: ctx.user.id,
      userRole: ctx.user.role,
      teamId: ctx.user.teamId,
    });
    return next({ ctx: { ...ctx, scope } });
  },
);
