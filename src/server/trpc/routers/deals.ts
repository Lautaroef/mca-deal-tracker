import { z } from "zod";
import { router, workspaceProcedure } from "../init";
import { db } from "@/server/db";
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

export const dealsRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    return listDeals(ctx.scope);
  }),

  getById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getDeal(ctx.scope, input.id);
    }),

  create: workspaceProcedure
    .input(
      z.object({
        merchantName: z.string().min(1, "Merchant name is required"),
        merchantEmail: z.string().email().optional(),
        merchantPhone: z.string().optional(),
        requestedAmount: z.number().positive("Requested amount must be positive"),
        notes: z.string().optional(),
        assignedUserId: z.string().optional(),
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
        id: z.string(),
        merchantName: z.string().min(1).optional(),
        merchantEmail: z.string().email().optional(),
        merchantPhone: z.string().optional(),
        requestedAmount: z.number().positive().optional(),
        notes: z.string().optional(),
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
        id: z.string(),
        status: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return updateDealStatus(
        db,
        ctx.scope,
        input.id,
        input.status as Parameters<typeof updateDealStatus>[3],
      );
    }),

  assign: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return assignDeal(db, ctx.scope, input.id, input.userId);
    }),

  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return softDeleteDeal(db, ctx.scope, input.id);
    }),

  getActivity: workspaceProcedure
    .input(z.object({ dealId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getDealEvents(db, input.dealId, ctx.scope.ctx.workspaceId);
    }),
});
