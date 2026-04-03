import { z } from "zod";
import { eq, and, desc, gte, lt } from "drizzle-orm";
import { eventLog } from "@/server/db/schema";
import type { Database } from "@/server/db";

// ─── Event Metadata Schemas ─────────────────────────────────────────────────

export const dealCreatedMetadataSchema = z.object({
  merchant_name: z.string(),
  status: z.string(),
  assigned_user_id: z.string().uuid(),
  requested_amount: z.string(),
});

export const statusChangedMetadataSchema = z.object({
  old_status: z.string(),
  new_status: z.string(),
  old_status_label: z.string(),
  new_status_label: z.string(),
});

export const dealAssignedMetadataSchema = z.object({
  old_user_id: z.string().uuid().nullable(),
  new_user_id: z.string().uuid(),
  old_user_name: z.string().nullable(),
  new_user_name: z.string(),
});

export const dealDeletedMetadataSchema = z.object({
  merchant_name: z.string(),
  status_at_deletion: z.string(),
});

export const dealUpdatedMetadataSchema = z.object({
  changes: z.array(
    z.object({
      field: z.string(),
      old_value: z.union([z.string(), z.null()]),
      new_value: z.union([z.string(), z.null()]),
    }),
  ),
});

// Discriminated union of all event metadata types
export const eventMetadataSchemas = {
  deal_created: dealCreatedMetadataSchema,
  status_changed: statusChangedMetadataSchema,
  deal_assigned: dealAssignedMetadataSchema,
  deal_deleted: dealDeletedMetadataSchema,
  deal_updated: dealUpdatedMetadataSchema,
} as const;

export type EventType = keyof typeof eventMetadataSchemas;

export type DealCreatedMetadata = z.infer<typeof dealCreatedMetadataSchema>;
export type StatusChangedMetadata = z.infer<typeof statusChangedMetadataSchema>;
export type DealAssignedMetadata = z.infer<typeof dealAssignedMetadataSchema>;
export type DealDeletedMetadata = z.infer<typeof dealDeletedMetadataSchema>;
export type DealUpdatedMetadata = z.infer<typeof dealUpdatedMetadataSchema>;

// ─── Log Event ───────────────────────────────────────────────────────────────

interface LogEventParams<T extends EventType> {
  workspaceId: string;
  dealId: string;
  actorId: string;
  eventType: T;
  metadata: z.infer<(typeof eventMetadataSchemas)[T]>;
}

/**
 * Insert a structured event into the event_log table.
 * Validates metadata against the Zod schema for the given event type.
 *
 * Designed to be called within a transaction alongside the mutation it logs.
 */
export async function logEvent<T extends EventType>(
  db: Database,
  params: LogEventParams<T>,
): Promise<void> {
  const { workspaceId, dealId, actorId, eventType, metadata } = params;

  // Validate metadata against the schema for this event type
  const schema = eventMetadataSchemas[eventType];
  const validated = schema.parse(metadata);

  await db.insert(eventLog).values({
    workspaceId,
    dealId,
    actorId,
    eventType,
    metadata: validated,
  });
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

/**
 * Fetch all events for a specific deal, ordered by most recent first.
 * Workspace-scoped to prevent cross-tenant data leakage.
 */
export async function getDealEvents(
  db: Database,
  dealId: string,
  workspaceId: string,
) {
  return db
    .select()
    .from(eventLog)
    .where(
      and(eq(eventLog.dealId, dealId), eq(eventLog.workspaceId, workspaceId)),
    )
    .orderBy(desc(eventLog.createdAt));
}

/**
 * Fetch all events performed by a specific user, optionally filtered to a single day.
 * Useful for audit trails: "show me everything user X did (today)".
 */
export async function getUserEvents(
  db: Database,
  actorId: string,
  workspaceId: string,
  date?: Date,
) {
  const conditions = [
    eq(eventLog.actorId, actorId),
    eq(eventLog.workspaceId, workspaceId),
  ];

  if (date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    conditions.push(gte(eventLog.createdAt, dayStart));
    conditions.push(lt(eventLog.createdAt, dayEnd));
  }

  return db
    .select()
    .from(eventLog)
    .where(and(...conditions))
    .orderBy(desc(eventLog.createdAt));
}
