import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, workspaceProcedure } from "../init";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import {
  listDeals,
  getDeal,
  createDeal,
  updateDeal,
  updateDealStatus,
  assignDeal,
  softDeleteDeal,
} from "@/server/services/deals";
import { getDealEvents } from "@/server/services/activity-log";
import { DEAL_STATUS_VALUES } from "@/server/lib/status-machine";

export const dealsRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    return listDeals(ctx.scope);
  }),

  getById: workspaceProcedure
    .input(z.object({ id: z.string().uuid("Invalid deal ID") }))
    .query(async ({ ctx, input }) => {
      return getDeal(ctx.scope, input.id);
    }),

  create: workspaceProcedure
    .input(
      z.object({
        merchantName: z.string().min(1, "Merchant name is required").max(255),
        merchantEmail: z.string().email().max(255).optional(),
        merchantPhone: z.string().max(50).optional(),
        requestedAmount: z.number().positive("Requested amount must be positive"),
        notes: z.string().max(10000).optional(),
        assignedUserId: z.string().uuid("Invalid user ID").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createDeal(db, ctx.scope.ctx, {
        ...input,
        requestedAmount: String(input.requestedAmount),
        assignedUserId: input.assignedUserId ?? ctx.user.id,
        status: "lead",
      });
    }),

  update: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid("Invalid deal ID"),
        merchantName: z.string().min(1).max(255).optional(),
        merchantEmail: z.string().email().max(255).optional(),
        merchantPhone: z.string().max(50).optional(),
        requestedAmount: z.number().positive().optional(),
        notes: z.string().max(10000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return updateDeal(db, ctx.scope, id, {
        ...data,
        requestedAmount:
          data.requestedAmount !== undefined
            ? String(data.requestedAmount)
            : undefined,
      });
    }),

  updateStatus: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid("Invalid deal ID"),
        status: z.enum(DEAL_STATUS_VALUES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return updateDealStatus(db, ctx.scope, input.id, input.status);
    }),

  assign: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid("Invalid deal ID"),
        userId: z.string().uuid("Invalid user ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return assignDeal(db, ctx.scope, input.id, input.userId);
    }),

  delete: workspaceProcedure
    .input(z.object({ id: z.string().uuid("Invalid deal ID") }))
    .mutation(async ({ ctx, input }) => {
      return softDeleteDeal(db, ctx.scope, input.id);
    }),

  listUsers: workspaceProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(eq(users.workspaceId, ctx.user.workspaceId))
      .orderBy(users.name);
  }),

  getActivity: workspaceProcedure
    .input(z.object({ dealId: z.string().uuid("Invalid deal ID") }))
    .query(async ({ ctx, input }) => {
      // Verify the deal is visible to this user before returning activity
      await ctx.scope.findDeal(input.dealId);
      return getDealEvents(db, input.dealId, ctx.scope.ctx.workspaceId);
    }),
});
