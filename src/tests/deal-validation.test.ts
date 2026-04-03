import { describe, it, expect } from "vitest";
import {
  createDealSchema,
  updateDealSchema,
} from "@/server/services/deals";
import { DEAL_STATUS_VALUES } from "@/server/lib/status-machine";

// ─── createDealSchema validation ─────────────────────────────────────────────

describe("createDealSchema — input validation", () => {
  const validInput = {
    merchantName: "Acme Corp",
    merchantEmail: "acme@example.com",
    merchantPhone: "(555) 123-4567",
    requestedAmount: "50000.00",
    assignedUserId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    status: "lead" as const,
    notes: "Some notes",
  };

  it("accepts a fully valid input", () => {
    const result = createDealSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("defaults status to 'lead' when omitted", () => {
    const { status, ...withoutStatus } = validInput;
    const result = createDealSchema.safeParse(withoutStatus);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("lead");
    }
  });

  it("rejects empty merchant name", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      merchantName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing merchant name", () => {
    const { merchantName, ...withoutName } = validInput;
    const result = createDealSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      merchantEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional email being omitted", () => {
    const { merchantEmail, ...withoutEmail } = validInput;
    const result = createDealSchema.safeParse(withoutEmail);
    expect(result.success).toBe(true);
  });

  it("rejects negative amount (string like '-5000')", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      requestedAmount: "-5000.00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric amount", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      requestedAmount: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects amount with more than 2 decimal places", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      requestedAmount: "50000.123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts amount with no decimal places", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      requestedAmount: "50000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts amount with 1 decimal place", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      requestedAmount: "50000.5",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing requestedAmount", () => {
    const { requestedAmount, ...withoutAmount } = validInput;
    const result = createDealSchema.safeParse(withoutAmount);
    expect(result.success).toBe(false);
  });

  it("rejects empty string requestedAmount", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      requestedAmount: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID assignedUserId", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      assignedUserId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing assignedUserId", () => {
    const { assignedUserId, ...withoutUser } = validInput;
    const result = createDealSchema.safeParse(withoutUser);
    expect(result.success).toBe(false);
  });

  it("rejects invalid status value", () => {
    const result = createDealSchema.safeParse({
      ...validInput,
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of DEAL_STATUS_VALUES) {
      const result = createDealSchema.safeParse({
        ...validInput,
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts optional fields being omitted (merchantEmail, merchantPhone, notes)", () => {
    const minimal = {
      merchantName: "Test",
      requestedAmount: "1000.00",
      assignedUserId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    };
    const result = createDealSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});

// ─── updateDealSchema validation ────────────────────────────────────────────

describe("updateDealSchema — input validation", () => {
  it("accepts partial updates (only merchantName)", () => {
    const result = updateDealSchema.safeParse({ merchantName: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty object (no changes)", () => {
    const result = updateDealSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects empty merchantName", () => {
    const result = updateDealSchema.safeParse({ merchantName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid merchantEmail", () => {
    const result = updateDealSchema.safeParse({
      merchantEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null merchantEmail (clearing the field)", () => {
    const result = updateDealSchema.safeParse({ merchantEmail: null });
    expect(result.success).toBe(true);
  });

  it("accepts null merchantPhone (clearing the field)", () => {
    const result = updateDealSchema.safeParse({ merchantPhone: null });
    expect(result.success).toBe(true);
  });

  it("accepts null notes (clearing the field)", () => {
    const result = updateDealSchema.safeParse({ notes: null });
    expect(result.success).toBe(true);
  });

  it("rejects invalid requestedAmount format", () => {
    const result = updateDealSchema.safeParse({
      requestedAmount: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative requestedAmount", () => {
    const result = updateDealSchema.safeParse({
      requestedAmount: "-100",
    });
    expect(result.success).toBe(false);
  });
});
