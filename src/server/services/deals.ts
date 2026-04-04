import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { deals, users } from "@/server/db/schema";
import type { Database } from "@/server/db";
import type { WorkspaceContext, WorkspaceScope } from "@/server/lib/workspace-scope";
import {
  validateTransition,
  getStatusLabel,
  DEAL_STATUS_VALUES,
  type DealStatus,
} from "@/server/lib/status-machine";
import { logEvent } from "@/server/services/activity-log";

// ─── Input Schemas ───────────────────────────────────────────────────────────

export const createDealSchema = z.object({
  merchantName: z.string().min(1, "Merchant name is required"),
  merchantEmail: z.string().email("Invalid email").optional(),
  merchantPhone: z.string().optional(),
  requestedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"),
  assignedUserId: z.string().uuid("Invalid user ID"),
  status: z.enum(DEAL_STATUS_VALUES).default("lead"),
  notes: z.string().optional(),
});

export const updateDealSchema = z.object({
  merchantName: z.string().min(1, "Merchant name is required").optional(),
  merchantEmail: z.string().email("Invalid email").nullable().optional(),
  merchantPhone: z.string().nullable().optional(),
  requestedAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid amount")
    .optional(),
  notes: z.string().nullable().optional(),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;

// ─── Read Operations (use scope) ─────────────────────────────────────────────

/**
 * List all deals visible to the current user, respecting workspace isolation
 * and role-based visibility.
 */
export async function listDeals(scope: WorkspaceScope) {
  return scope.queryDeals();
}

/**
 * Fetch a single deal by ID. Throws if not found or not visible
 * to the current user.
 */
export async function getDeal(scope: WorkspaceScope, dealId: string) {
  return scope.findDeal(dealId);
}

// ─── Write Operations (use transaction) ──────────────────────────────────────

/**
 * Create a new deal in the workspace. Logs a `deal_created` event atomically.
 */
export async function createDeal(
  db: Database,
  ctx: WorkspaceContext,
  input: CreateDealInput,
) {
  const validated = createDealSchema.parse(input);

  // Validate that the assigned user belongs to the same workspace
  const [assignedUser] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.id, validated.assignedUserId),
        eq(users.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);

  if (!assignedUser) {
    throw new Error(
      `Cannot assign deal: user '${validated.assignedUserId}' does not belong to this workspace.`,
    );
  }

  return db.transaction(async (tx) => {
    const [deal] = await tx
      .insert(deals)
      .values({
        workspaceId: ctx.workspaceId,
        assignedUserId: validated.assignedUserId,
        merchantName: validated.merchantName,
        merchantEmail: validated.merchantEmail ?? null,
        merchantPhone: validated.merchantPhone ?? null,
        requestedAmount: validated.requestedAmount,
        status: validated.status,
        notes: validated.notes ?? null,
      })
      .returning();

    await logEvent(tx, {
      workspaceId: ctx.workspaceId,
      dealId: deal.id,
      actorId: ctx.userId,
      eventType: "deal_created",
      metadata: {
        merchant_name: deal.merchantName,
        status: deal.status,
        status_label: getStatusLabel(deal.status as DealStatus),
        assigned_user_id: deal.assignedUserId,
        assigned_user_name: assignedUser.name,
        requested_amount: deal.requestedAmount,
      },
    });

    return deal;
  });
}

/**
 * Update non-status fields on a deal. Verifies workspace ownership via scope,
 * then mutates atomically with a `deal_updated` event.
 */
export async function updateDeal(
  db: Database,
  scope: WorkspaceScope,
  dealId: string,
  input: UpdateDealInput,
) {
  const validated = updateDealSchema.parse(input);

  // Verify the deal exists and is visible to this user
  const existing = await scope.findDeal(dealId);

  // Build the list of actual changes
  const changes: Array<{
    field: string;
    old_value: string | null;
    new_value: string | null;
  }> = [];

  const updatePayload: Record<string, unknown> = {};

  if (
    validated.merchantName !== undefined &&
    validated.merchantName !== existing.merchantName
  ) {
    changes.push({
      field: "merchant_name",
      old_value: existing.merchantName,
      new_value: validated.merchantName,
    });
    updatePayload.merchantName = validated.merchantName;
  }

  if (
    validated.merchantEmail !== undefined &&
    validated.merchantEmail !== existing.merchantEmail
  ) {
    changes.push({
      field: "merchant_email",
      old_value: existing.merchantEmail ?? null,
      new_value: validated.merchantEmail ?? null,
    });
    updatePayload.merchantEmail = validated.merchantEmail ?? null;
  }

  if (
    validated.merchantPhone !== undefined &&
    validated.merchantPhone !== existing.merchantPhone
  ) {
    changes.push({
      field: "merchant_phone",
      old_value: existing.merchantPhone ?? null,
      new_value: validated.merchantPhone ?? null,
    });
    updatePayload.merchantPhone = validated.merchantPhone ?? null;
  }

  if (
    validated.requestedAmount !== undefined &&
    validated.requestedAmount !== existing.requestedAmount
  ) {
    changes.push({
      field: "requested_amount",
      old_value: existing.requestedAmount,
      new_value: validated.requestedAmount,
    });
    updatePayload.requestedAmount = validated.requestedAmount;
  }

  if (validated.notes !== undefined && validated.notes !== existing.notes) {
    changes.push({
      field: "notes",
      old_value: existing.notes ?? null,
      new_value: validated.notes ?? null,
    });
    updatePayload.notes = validated.notes ?? null;
  }

  // Nothing actually changed
  if (changes.length === 0) {
    return existing;
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(deals)
      .set(updatePayload)
      .where(
        and(
          eq(deals.id, dealId),
          eq(deals.workspaceId, scope.ctx.workspaceId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error(`Deal not found: ${dealId}`);
    }

    await logEvent(tx, {
      workspaceId: scope.ctx.workspaceId,
      dealId,
      actorId: scope.ctx.userId,
      eventType: "deal_updated",
      metadata: { changes },
    });

    return updated;
  });
}

/**
 * Transition a deal to a new status. Validates the transition against the
 * state machine, then mutates atomically with a `status_changed` event.
 *
 * The status is re-read inside the transaction with SELECT FOR UPDATE to
 * prevent TOCTOU race conditions where two concurrent requests both read
 * the same old status and attempt incompatible transitions.
 */
export async function updateDealStatus(
  db: Database,
  scope: WorkspaceScope,
  dealId: string,
  newStatus: DealStatus,
) {
  // Authorization check: verify the deal exists, is visible, and is not soft-deleted
  await scope.findDeal(dealId);

  return db.transaction(async (tx) => {
    // Re-read the deal inside the transaction with a row lock to get the
    // authoritative current status. This prevents race conditions.
    const [current] = await tx
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.id, dealId),
          eq(deals.workspaceId, scope.ctx.workspaceId),
          isNull(deals.deletedAt),
        ),
      )
      .for("update");

    if (!current) {
      throw new Error(`Deal not found: ${dealId}`);
    }

    const oldStatus = current.status as DealStatus;

    // Validate the transition against the authoritative current status
    const result = validateTransition(oldStatus, newStatus);
    if (!result.valid) {
      throw new Error(result.error);
    }

    const [updated] = await tx
      .update(deals)
      .set({ status: newStatus })
      .where(
        and(
          eq(deals.id, dealId),
          eq(deals.workspaceId, scope.ctx.workspaceId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error(`Deal not found: ${dealId}`);
    }

    await logEvent(tx, {
      workspaceId: scope.ctx.workspaceId,
      dealId,
      actorId: scope.ctx.userId,
      eventType: "status_changed",
      metadata: {
        old_status: oldStatus,
        new_status: newStatus,
        old_status_label: getStatusLabel(oldStatus),
        new_status_label: getStatusLabel(newStatus),
      },
    });

    return updated;
  });
}

/**
 * Reassign a deal to a different user. Logs a `deal_assigned` event with
 * both old and new user names for the activity timeline.
 */
export async function assignDeal(
  db: Database,
  scope: WorkspaceScope,
  dealId: string,
  newUserId: string,
) {
  // Verify the deal exists and is visible
  const existing = await scope.findDeal(dealId);

  // Fetch the new user — and verify they belong to the same workspace
  const [newUser] = await db
    .select({ name: users.name, workspaceId: users.workspaceId })
    .from(users)
    .where(
      and(
        eq(users.id, newUserId),
        eq(users.workspaceId, scope.ctx.workspaceId),
      ),
    );

  if (!newUser) {
    throw new Error(
      `Cannot assign deal: user '${newUserId}' not found in this workspace.`,
    );
  }

  // Fetch the old user's name (if there is one)
  let oldUserName: string | null = null;
  if (existing.assignedUserId) {
    const [oldUser] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, existing.assignedUserId));
    oldUserName = oldUser?.name ?? null;
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(deals)
      .set({ assignedUserId: newUserId })
      .where(
        and(
          eq(deals.id, dealId),
          eq(deals.workspaceId, scope.ctx.workspaceId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error(`Deal not found: ${dealId}`);
    }

    await logEvent(tx, {
      workspaceId: scope.ctx.workspaceId,
      dealId,
      actorId: scope.ctx.userId,
      eventType: "deal_assigned",
      metadata: {
        old_user_id: existing.assignedUserId ?? null,
        new_user_id: newUserId,
        old_user_name: oldUserName,
        new_user_name: newUser.name,
      },
    });

    return updated;
  });
}

/**
 * Soft-delete a deal by setting `deleted_at`. The deal disappears from all
 * queries (the workspace scope filters on `deleted_at IS NULL`) but remains
 * in the database. Logs a `deal_deleted` event.
 */
export async function softDeleteDeal(
  db: Database,
  scope: WorkspaceScope,
  dealId: string,
) {
  // Verify the deal exists and is visible
  const existing = await scope.findDeal(dealId);

  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(deals)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(deals.id, dealId),
          eq(deals.workspaceId, scope.ctx.workspaceId),
        ),
      )
      .returning();

    if (!deleted) {
      throw new Error(`Deal not found: ${dealId}`);
    }

    await logEvent(tx, {
      workspaceId: scope.ctx.workspaceId,
      dealId,
      actorId: scope.ctx.userId,
      eventType: "deal_deleted",
      metadata: {
        merchant_name: existing.merchantName,
        status_at_deletion: existing.status,
        status_at_deletion_label: getStatusLabel(existing.status as DealStatus),
      },
    });

    return deleted;
  });
}
