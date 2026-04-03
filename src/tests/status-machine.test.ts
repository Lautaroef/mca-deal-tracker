import { describe, it, expect } from "vitest";
import {
  validateTransition,
  getValidTransitions,
  VALID_TRANSITIONS,
  DEAL_STATUSES,
  getStatusLabel,
  type DealStatus,
} from "@/server/lib/status-machine";

// ─── All statuses for iteration ──────────────────────────────────────────────

const ALL_STATUSES = DEAL_STATUSES.map((s) => s.value);

// ─── Valid transitions succeed ───────────────────────────────────────────────

describe("validateTransition — valid transitions", () => {
  const validCases: [DealStatus, DealStatus][] = [
    ["lead", "new_application"],
    ["new_application", "missing_documents"],
    ["new_application", "ready_to_submit"],
    ["missing_documents", "ready_to_submit"],
    ["missing_documents", "dead"],
    ["ready_to_submit", "submitted"],
    ["ready_to_submit", "dead"],
    ["submitted", "approved"],
    ["submitted", "dead"],
    ["approved", "offer_accepted"],
    ["approved", "ready_to_submit"],
    ["approved", "dead"],
    ["offer_accepted", "contracts_out"],
    ["offer_accepted", "approved"],
    ["offer_accepted", "dead"],
    ["contracts_out", "funded"],
    ["contracts_out", "dead"],
    ["dead", "lead"],
  ];

  it.each(validCases)(
    "%s → %s should be valid",
    (from, to) => {
      const result = validateTransition(from, to);
      expect(result).toEqual({ valid: true });
    },
  );
});

// ─── Invalid transitions return descriptive errors ──────────────────────────

describe("validateTransition — invalid transitions", () => {
  it("Lead → Funded fails with message mentioning valid options", () => {
    const result = validateTransition("lead", "funded");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Lead");
      expect(result.error).toContain("Funded");
      expect(result.error).toContain("New Application");
    }
  });

  it("Lead → Dead fails (not a valid transition from Lead)", () => {
    const result = validateTransition("lead", "dead");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Lead");
      expect(result.error).toContain("Dead");
    }
  });

  it("Submitted → Funded fails (must go through Approved first)", () => {
    const result = validateTransition("submitted", "funded");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Submitted");
      expect(result.error).toContain("Funded");
      expect(result.error).toContain("Approved");
    }
  });

  it("same-status transition fails (e.g. lead → lead)", () => {
    const result = validateTransition("lead", "lead");
    expect(result.valid).toBe(false);
  });
});

// ─── Terminal states ────────────────────────────────────────────────────────

describe("terminal states", () => {
  it("Funded has no transitions out", () => {
    const transitions = getValidTransitions("funded");
    expect(transitions).toEqual([]);
  });

  it("Funded → any status is invalid", () => {
    for (const status of ALL_STATUSES) {
      if (status === "funded") continue;
      const result = validateTransition("funded", status);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("terminal status");
      }
    }
  });

  it("Dead → Lead is the only exit from Dead", () => {
    const transitions = getValidTransitions("dead");
    expect(transitions).toEqual(["lead"]);
  });

  it("Dead → anything other than Lead is invalid", () => {
    for (const status of ALL_STATUSES) {
      if (status === "lead" || status === "dead") continue;
      const result = validateTransition("dead", status);
      expect(result.valid).toBe(false);
    }
  });
});

// ─── getValidTransitions returns correct arrays ─────────────────────────────

describe("getValidTransitions", () => {
  it.each(ALL_STATUSES)(
    "returns correct transitions for %s",
    (status) => {
      const result = getValidTransitions(status as DealStatus);
      const expected = [...VALID_TRANSITIONS[status as DealStatus]];
      expect(result).toEqual(expected);
    },
  );

  it("returns a new array (not the original reference)", () => {
    const a = getValidTransitions("lead");
    const b = getValidTransitions("lead");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ─── Error messages contain human-readable labels ───────────────────────────

describe("error messages use human-readable labels", () => {
  it("error message uses 'New Application' not 'new_application'", () => {
    const result = validateTransition("lead", "funded");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).not.toContain("new_application");
      expect(result.error).toContain("New Application");
    }
  });

  it("error message uses 'Missing Documents' not 'missing_documents'", () => {
    const result = validateTransition("new_application", "funded");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).not.toContain("missing_documents");
      expect(result.error).toContain("Missing Documents");
    }
  });

  it("every status has a human-readable label via getStatusLabel", () => {
    for (const status of ALL_STATUSES) {
      const label = getStatusLabel(status as DealStatus);
      expect(label).toBeTruthy();
      // Labels should not contain underscores (they are human-readable)
      expect(label).not.toContain("_");
    }
  });
});
