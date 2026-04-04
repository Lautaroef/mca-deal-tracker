import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  users,
  workspaces,
  deals,
  teamMemberships,
} from "@/server/db/schema";
import {
  createWorkspaceScope,
  type WorkspaceContext,
} from "@/server/lib/workspace-scope";
import {
  createDeal,
  updateDealStatus,
  softDeleteDeal,
} from "@/server/services/deals";
import {
  validateTransition,
  VALID_TRANSITIONS,
  DEAL_STATUSES,
  DEAL_STATUS_VALUES,
  getStatusLabel,
  type DealStatus,
} from "@/server/lib/status-machine";

// ─── Test context ───────────────────────────────────────────────────────────

let wsA: typeof workspaces.$inferSelect;
let adminA: typeof users.$inferSelect;
let repEmily: typeof users.$inferSelect;
let adminTeamId: string | null;

const ALL_STATUSES: DealStatus[] = [...DEAL_STATUS_VALUES];

beforeAll(async () => {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, "Apex Funding Brokers"));
  if (!ws) throw new Error("Workspace A not found — run seed first");
  wsA = ws;

  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.workspaceId, wsA.id));

  adminA = allUsers.find((u) => u.role === "admin")!;
  repEmily = allUsers.find((u) => u.name === "Emily Rodriguez")!;

  if (!adminA || !repEmily) {
    throw new Error("Required seed users not found");
  }

  const [membership] = await db
    .select()
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, adminA.id));
  adminTeamId = membership?.teamId ?? null;
});

function buildAdminCtx(): WorkspaceContext {
  return {
    workspaceId: wsA.id,
    userId: adminA.id,
    userRole: adminA.role,
    teamId: adminTeamId,
  };
}

function buildAdminScope() {
  return createWorkspaceScope(db, buildAdminCtx());
}

async function createTestDeal(overrides?: {
  status?: DealStatus;
  assignedUserId?: string;
}) {
  return createDeal(db, buildAdminCtx(), {
    merchantName: `StatusTest ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    merchantEmail: "test@status.com",
    requestedAmount: "10000.00",
    assignedUserId: overrides?.assignedUserId ?? repEmily.id,
    status: overrides?.status ?? "lead",
  });
}

/**
 * Walk a deal from "lead" to the desired status through valid transitions.
 * Returns the deal in the target status.
 */
async function walkDealToStatus(targetStatus: DealStatus) {
  const paths: Record<DealStatus, DealStatus[]> = {
    lead: [],
    new_application: ["new_application"],
    missing_documents: ["new_application", "missing_documents"],
    ready_to_submit: ["new_application", "ready_to_submit"],
    submitted: ["new_application", "ready_to_submit", "submitted"],
    approved: [
      "new_application",
      "ready_to_submit",
      "submitted",
      "approved",
    ],
    offer_accepted: [
      "new_application",
      "ready_to_submit",
      "submitted",
      "approved",
      "offer_accepted",
    ],
    contracts_out: [
      "new_application",
      "ready_to_submit",
      "submitted",
      "approved",
      "offer_accepted",
      "contracts_out",
    ],
    funded: [
      "new_application",
      "ready_to_submit",
      "submitted",
      "approved",
      "offer_accepted",
      "contracts_out",
      "funded",
    ],
    dead: [
      "new_application",
      "ready_to_submit",
      "dead",
    ],
  };

  const deal = await createTestDeal({ status: "lead" });
  const scope = buildAdminScope();
  const steps = paths[targetStatus];

  let current = deal;
  for (const step of steps) {
    current = await updateDealStatus(db, scope, deal.id, step);
  }

  return current;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. EVERY VALID TRANSITION SUCCEEDS AT THE SERVICE LEVEL
// ═══════════════════════════════════════════════════════════════════════════════

describe("every valid transition succeeds (service level)", () => {
  // Build the full list of all 18 valid transitions from the transition map
  const validTransitions: [DealStatus, DealStatus][] = [];
  for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
    for (const to of targets) {
      validTransitions.push([from as DealStatus, to]);
    }
  }

  // Verify we have exactly 18 valid transitions
  it("transition map defines exactly 18 valid transitions", () => {
    expect(validTransitions).toHaveLength(18);
  });

  it.each(validTransitions)(
    "%s → %s succeeds at service level",
    async (from, to) => {
      const deal = await walkDealToStatus(from);
      const scope = buildAdminScope();
      const updated = await updateDealStatus(db, scope, deal.id, to);
      expect(updated.status).toBe(to);
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. EVERY INVALID TRANSITION IS BLOCKED
// ═══════════════════════════════════════════════════════════════════════════════

describe("every invalid transition is blocked", () => {
  // Compute all invalid transitions: every (from, to) pair that is NOT in VALID_TRANSITIONS
  const invalidTransitions: [DealStatus, DealStatus][] = [];
  for (const from of ALL_STATUSES) {
    const validTargets = VALID_TRANSITIONS[from];
    for (const to of ALL_STATUSES) {
      if (!validTargets.includes(to)) {
        invalidTransitions.push([from, to]);
      }
    }
  }

  it(`there are ${100 - 18} invalid transitions (100 total - 18 valid)`, () => {
    // 10 statuses * 10 statuses = 100 pairs. 18 are valid. 82 are invalid.
    expect(invalidTransitions).toHaveLength(82);
  });

  // Test a representative sample of important invalid transitions at the pure function level
  const keyInvalidCases: [DealStatus, DealStatus, string][] = [
    ["lead", "funded", "Cannot transition from 'Lead' to 'Funded'"],
    ["lead", "approved", "Cannot transition from 'Lead' to 'Approved'"],
    ["lead", "dead", "Cannot transition from 'Lead' to 'Dead'"],
    ["lead", "lead", "Cannot transition from 'Lead' to 'Lead'"],
    ["submitted", "lead", "Cannot transition from 'Submitted' to 'Lead'"],
    ["submitted", "funded", "Cannot transition from 'Submitted' to 'Funded'"],
    ["funded", "dead", "terminal status"],
    ["funded", "lead", "terminal status"],
    ["funded", "funded", "terminal status"],
    ["dead", "new_application", "Cannot transition from 'Dead' to 'New Application'"],
    ["dead", "funded", "Cannot transition from 'Dead' to 'Funded'"],
    ["dead", "dead", "Cannot transition from 'Dead' to 'Dead'"],
    ["contracts_out", "approved", "Cannot transition from 'Contracts Out' to 'Approved'"],
    ["offer_accepted", "submitted", "Cannot transition from 'Offer Accepted' to 'Submitted'"],
    ["approved", "new_application", "Cannot transition from 'Approved' to 'New Application'"],
    ["missing_documents", "submitted", "Cannot transition from 'Missing Documents' to 'Submitted'"],
    ["ready_to_submit", "approved", "Cannot transition from 'Ready to Submit' to 'Approved'"],
  ];

  it.each(keyInvalidCases)(
    "%s → %s is blocked with error containing '%s'",
    (from, to, expectedError) => {
      const result = validateTransition(from, to);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain(expectedError);
      }
    },
  );

  // Exhaustive check: every invalid pair fails at the pure function level
  it("all 82 invalid pairs fail validation", () => {
    for (const [from, to] of invalidTransitions) {
      const result = validateTransition(from, to);
      expect(result.valid).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. TERMINAL STATE ENFORCEMENT — Funded has NO way out
// ═══════════════════════════════════════════════════════════════════════════════

describe("terminal state enforcement — Funded", () => {
  it("Funded has zero valid transitions", () => {
    expect(VALID_TRANSITIONS.funded).toHaveLength(0);
  });

  it("Funded → every status fails at service level", async () => {
    const deal = await walkDealToStatus("funded");
    const scope = buildAdminScope();

    for (const target of ALL_STATUSES) {
      await expect(
        updateDealStatus(db, scope, deal.id, target),
      ).rejects.toThrow("terminal status");
    }
  });

  it("error message for Funded mentions '(none — this is a terminal status)'", () => {
    const result = validateTransition("funded", "dead");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("none — this is a terminal status");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DEAD RESURRECTION — Dead → Lead works, Dead → anything else fails
// ═══════════════════════════════════════════════════════════════════════════════

describe("Dead resurrection", () => {
  it("Dead → Lead succeeds at service level", async () => {
    const deal = await walkDealToStatus("dead");
    const scope = buildAdminScope();

    const resurrected = await updateDealStatus(db, scope, deal.id, "lead");
    expect(resurrected.status).toBe("lead");
  });

  it("Dead → every status except Lead fails at service level", async () => {
    // Create ONE dead deal and reuse it for all invalid targets.
    // Since all these transitions fail, the deal stays at "dead".
    const deal = await walkDealToStatus("dead");
    const scope = buildAdminScope();

    for (const target of ALL_STATUSES) {
      if (target === "lead") continue;

      await expect(
        updateDealStatus(db, scope, deal.id, target),
      ).rejects.toThrow("Cannot transition from 'Dead'");
    }
  });

  it("resurrected deal (Dead → Lead) can then transition to New Application", async () => {
    const deal = await walkDealToStatus("dead");
    const scope = buildAdminScope();

    await updateDealStatus(db, scope, deal.id, "lead");
    const updated = await updateDealStatus(db, scope, deal.id, "new_application");
    expect(updated.status).toBe("new_application");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SAME-STATUS TRANSITION BLOCKED
// ═══════════════════════════════════════════════════════════════════════════════

describe("same-status transition blocked", () => {
  it.each(ALL_STATUSES)(
    "%s → %s (same status) fails",
    async (status) => {
      const result = validateTransition(status, status);
      expect(result.valid).toBe(false);
    },
  );

  it("same-status transition on Lead fails at service level", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScope();

    await expect(
      updateDealStatus(db, scope, deal.id, "lead"),
    ).rejects.toThrow("Cannot transition");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. NON-EXISTENT STATUS REJECTED
// ═══════════════════════════════════════════════════════════════════════════════

describe("non-existent status rejected", () => {
  it("z.enum rejects 'invalid_status' at the schema level", () => {
    const { z } = require("zod");
    const schema = z.enum(DEAL_STATUS_VALUES);
    const result = schema.safeParse("invalid_status");
    expect(result.success).toBe(false);
  });

  it("z.enum rejects empty string at the schema level", () => {
    const { z } = require("zod");
    const schema = z.enum(DEAL_STATUS_VALUES);
    const result = schema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("z.enum rejects numbers at the schema level", () => {
    const { z } = require("zod");
    const schema = z.enum(DEAL_STATUS_VALUES);
    const result = schema.safeParse(42);
    expect(result.success).toBe(false);
  });

  it("z.enum rejects null at the schema level", () => {
    const { z } = require("zod");
    const schema = z.enum(DEAL_STATUS_VALUES);
    const result = schema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SOFT-DELETED DEAL TRANSITIONS BLOCKED
// ═══════════════════════════════════════════════════════════════════════════════

describe("soft-deleted deal transitions blocked", () => {
  it("cannot transition a soft-deleted deal — throws 'Deal not found'", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScope();
    await softDeleteDeal(db, scope, deal.id);

    await expect(
      updateDealStatus(db, scope, deal.id, "new_application"),
    ).rejects.toThrow("Deal not found");
  });

  it("soft-deleted deal in any status cannot be transitioned", async () => {
    // Create a deal at 'new_application' status, delete it, try to transition
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScope();
    await updateDealStatus(db, scope, deal.id, "new_application");
    await softDeleteDeal(db, scope, deal.id);

    await expect(
      updateDealStatus(db, scope, deal.id, "ready_to_submit"),
    ).rejects.toThrow("Deal not found");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. RACE CONDITION TEST
// ═══════════════════════════════════════════════════════════════════════════════

describe("race condition handling", () => {
  it("two simultaneous transitions from the same state — one succeeds, one fails or transitions from new state", async () => {
    // Create a deal at 'new_application' which can go to 'missing_documents' or 'ready_to_submit'
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScope();
    await updateDealStatus(db, scope, deal.id, "new_application");

    // Fire both transitions simultaneously
    const results = await Promise.allSettled([
      updateDealStatus(db, buildAdminScope(), deal.id, "missing_documents"),
      updateDealStatus(db, buildAdminScope(), deal.id, "ready_to_submit"),
    ]);

    // At least one must succeed
    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Verify the deal is in one of the two valid target states
    const finalDeal = await buildAdminScope().findDeal(deal.id);
    expect(["missing_documents", "ready_to_submit"]).toContain(
      finalDeal.status,
    );
  });

  it("two simultaneous identical transitions — only one succeeds logically (both may complete but final state is correct)", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScope();

    // Both try lead → new_application simultaneously
    const results = await Promise.allSettled([
      updateDealStatus(db, buildAdminScope(), deal.id, "new_application"),
      updateDealStatus(db, buildAdminScope(), deal.id, "new_application"),
    ]);

    // At least one must succeed
    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Verify the deal is at the expected state
    const finalDeal = await buildAdminScope().findDeal(deal.id);
    expect(finalDeal.status).toBe("new_application");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ERROR MESSAGE QUALITY
// ═══════════════════════════════════════════════════════════════════════════════

describe("error message quality", () => {
  it("error contains the current status label", () => {
    const result = validateTransition("ready_to_submit", "funded");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Ready to Submit");
    }
  });

  it("error contains the attempted status label", () => {
    const result = validateTransition("ready_to_submit", "funded");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Funded");
    }
  });

  it("error lists all valid transitions from the current status", () => {
    const result = validateTransition("ready_to_submit", "funded");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Submitted");
      expect(result.error).toContain("Dead");
    }
  });

  it("error uses 'Cannot transition from' format", () => {
    const result = validateTransition("lead", "funded");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(
        /^Cannot transition from '.+' to '.+'\. Valid transitions from '.+': .+$/,
      );
    }
  });

  it("error never contains raw enum values (underscored)", () => {
    // Test several transitions that would expose enum values
    const cases: [DealStatus, DealStatus][] = [
      ["new_application", "funded"],
      ["missing_documents", "approved"],
      ["ready_to_submit", "offer_accepted"],
      ["offer_accepted", "submitted"],
      ["contracts_out", "approved"],
    ];

    for (const [from, to] of cases) {
      const result = validateTransition(from, to);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        // The error message should NOT contain underscored enum values
        expect(result.error).not.toMatch(
          /new_application|missing_documents|ready_to_submit|offer_accepted|contracts_out/,
        );
      }
    }
  });

  it("service-level error for invalid transition preserves descriptive message", async () => {
    const deal = await createTestDeal({ status: "lead" });
    const scope = buildAdminScope();

    try {
      await updateDealStatus(db, scope, deal.id, "funded");
      expect.unreachable("Should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("Cannot transition from 'Lead' to 'Funded'");
      expect(message).toContain("New Application");
    }
  });

  it("terminal state error message is distinct from non-terminal invalid transition errors", () => {
    const terminalResult = validateTransition("funded", "dead");
    const nonTerminalResult = validateTransition("lead", "funded");

    expect(terminalResult.valid).toBe(false);
    expect(nonTerminalResult.valid).toBe(false);

    if (!terminalResult.valid && !nonTerminalResult.valid) {
      expect(terminalResult.error).toContain("terminal status");
      expect(nonTerminalResult.error).not.toContain("terminal status");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. BACK-TRANSITIONS WORK
// ═══════════════════════════════════════════════════════════════════════════════

describe("back-transitions work", () => {
  it("Approved → Ready to Submit (resubmission) succeeds", async () => {
    const deal = await walkDealToStatus("approved");
    const scope = buildAdminScope();

    const resubmitted = await updateDealStatus(
      db,
      scope,
      deal.id,
      "ready_to_submit",
    );
    expect(resubmitted.status).toBe("ready_to_submit");
  });

  it("Offer Accepted → Approved (back to negotiation) succeeds", async () => {
    const deal = await walkDealToStatus("offer_accepted");
    const scope = buildAdminScope();

    const backToApproved = await updateDealStatus(
      db,
      scope,
      deal.id,
      "approved",
    );
    expect(backToApproved.status).toBe("approved");
  });

  it("resubmission cycle: Approved → Ready to Submit → Submitted → Approved again", async () => {
    const deal = await walkDealToStatus("approved");
    const scope = buildAdminScope();

    await updateDealStatus(db, scope, deal.id, "ready_to_submit");
    await updateDealStatus(db, scope, deal.id, "submitted");
    const reApproved = await updateDealStatus(db, scope, deal.id, "approved");
    expect(reApproved.status).toBe("approved");
  });

  it("negotiation cycle: Offer Accepted → Approved → Offer Accepted again", async () => {
    const deal = await walkDealToStatus("offer_accepted");
    const scope = buildAdminScope();

    await updateDealStatus(db, scope, deal.id, "approved");
    const reAccepted = await updateDealStatus(
      db,
      scope,
      deal.id,
      "offer_accepted",
    );
    expect(reAccepted.status).toBe("offer_accepted");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. TRANSITION MAP COMPLETENESS
// ═══════════════════════════════════════════════════════════════════════════════

describe("transition map completeness", () => {
  it("every status in DEAL_STATUS_VALUES has an entry in VALID_TRANSITIONS", () => {
    for (const status of DEAL_STATUS_VALUES) {
      expect(VALID_TRANSITIONS).toHaveProperty(status);
    }
  });

  it("every target in VALID_TRANSITIONS is itself a valid DealStatus", () => {
    for (const targets of Object.values(VALID_TRANSITIONS)) {
      for (const target of targets) {
        expect(DEAL_STATUS_VALUES).toContain(target);
      }
    }
  });

  it("every status has a human-readable label", () => {
    for (const status of DEAL_STATUS_VALUES) {
      const label = getStatusLabel(status);
      expect(label).toBeTruthy();
      expect(label).not.toContain("_");
    }
  });

  it("DEAL_STATUSES has exactly 10 entries", () => {
    expect(DEAL_STATUSES).toHaveLength(10);
  });

  it("the statuses span 6 segments", () => {
    const segments = new Set(DEAL_STATUSES.map((s) => s.segment));
    expect(segments.size).toBe(6);
    expect(segments).toContain("Intake");
    expect(segments).toContain("Submission");
    expect(segments).toContain("Negotiating");
    expect(segments).toContain("Closing");
    expect(segments).toContain("Funded");
    expect(segments).toContain("Terminal");
  });
});
