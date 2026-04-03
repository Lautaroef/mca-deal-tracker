import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const dealStatusEnum = pgEnum("deal_status", [
  "lead",
  "new_application",
  "missing_documents",
  "ready_to_submit",
  "submitted",
  "approved",
  "offer_accepted",
  "contracts_out",
  "funded",
  "dead",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "deal_created",
  "status_changed",
  "deal_assigned",
  "deal_deleted",
  "deal_updated",
]);

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "team_leader",
  "rep",
]);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("users_workspace_id_idx").on(table.workspaceId)],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("teams_workspace_id_idx").on(table.workspaceId)],
);

export const teamMemberships = pgTable(
  "team_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("team_memberships_team_id_idx").on(table.teamId),
    index("team_memberships_user_id_idx").on(table.userId),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assignedUserId: uuid("assigned_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    merchantName: varchar("merchant_name", { length: 255 }).notNull(),
    merchantEmail: varchar("merchant_email", { length: 255 }),
    merchantPhone: varchar("merchant_phone", { length: 50 }),
    requestedAmount: numeric("requested_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    status: dealStatusEnum("status").notNull().default("lead"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("deals_workspace_id_idx").on(table.workspaceId),
    index("deals_status_idx").on(table.status),
    index("deals_assigned_user_id_idx").on(table.assignedUserId),
    index("deals_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const eventLog = pgTable(
  "event_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: eventTypeEnum("event_type").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("event_log_deal_id_idx").on(table.dealId),
    index("event_log_workspace_id_idx").on(table.workspaceId),
    index("event_log_actor_id_idx").on(table.actorId),
    index("event_log_created_at_idx").on(table.createdAt),
  ],
);

// ─── Type Inference Helpers ──────────────────────────────────────────────────

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export type TeamMembership = typeof teamMemberships.$inferSelect;
export type NewTeamMembership = typeof teamMemberships.$inferInsert;

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;

export type EventLog = typeof eventLog.$inferSelect;
export type NewEventLog = typeof eventLog.$inferInsert;
