// ─── Deal Status Types ───────────────────────────────────────────────────────

export type DealStatus =
  | "lead"
  | "new_application"
  | "missing_documents"
  | "ready_to_submit"
  | "submitted"
  | "approved"
  | "offer_accepted"
  | "contracts_out"
  | "funded"
  | "dead";

export type StatusSegment =
  | "Intake"
  | "Submission"
  | "Negotiating"
  | "Closing"
  | "Funded"
  | "Terminal";

export interface StatusInfo {
  value: DealStatus;
  label: string;
  segment: StatusSegment;
}

// ─── Status Definitions ──────────────────────────────────────────────────────

export const DEAL_STATUSES: readonly StatusInfo[] = [
  { value: "lead", label: "Lead", segment: "Intake" },
  { value: "new_application", label: "New Application", segment: "Intake" },
  {
    value: "missing_documents",
    label: "Missing Documents",
    segment: "Intake",
  },
  {
    value: "ready_to_submit",
    label: "Ready to Submit",
    segment: "Submission",
  },
  { value: "submitted", label: "Submitted", segment: "Submission" },
  { value: "approved", label: "Approved", segment: "Negotiating" },
  { value: "offer_accepted", label: "Offer Accepted", segment: "Closing" },
  { value: "contracts_out", label: "Contracts Out", segment: "Closing" },
  { value: "funded", label: "Funded", segment: "Funded" },
  { value: "dead", label: "Dead", segment: "Terminal" },
] as const;

// ─── Label Lookup ────────────────────────────────────────────────────────────

const STATUS_LABEL_MAP: Record<DealStatus, string> = Object.fromEntries(
  DEAL_STATUSES.map((s) => [s.value, s.label]),
) as Record<DealStatus, string>;

export function getStatusLabel(status: DealStatus): string {
  return STATUS_LABEL_MAP[status];
}

// ─── Valid Transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<DealStatus, readonly DealStatus[]> = {
  lead: ["new_application"],
  new_application: ["missing_documents", "ready_to_submit"],
  missing_documents: ["ready_to_submit", "dead"],
  ready_to_submit: ["submitted", "dead"],
  submitted: ["approved", "dead"],
  approved: ["offer_accepted", "ready_to_submit", "dead"],
  offer_accepted: ["contracts_out", "approved", "dead"],
  contracts_out: ["funded", "dead"],
  funded: [],
  dead: ["lead"],
} as const;

// ─── Transition Validation ───────────────────────────────────────────────────

export type TransitionResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateTransition(
  from: DealStatus,
  to: DealStatus,
): TransitionResult {
  const allowed = VALID_TRANSITIONS[from];

  if (allowed.includes(to)) {
    return { valid: true };
  }

  const fromLabel = getStatusLabel(from);
  const toLabel = getStatusLabel(to);
  const validLabels =
    allowed.length > 0
      ? allowed.map(getStatusLabel).join(", ")
      : "(none — this is a terminal status)";

  return {
    valid: false,
    error: `Cannot transition from '${fromLabel}' to '${toLabel}'. Valid transitions from '${fromLabel}': ${validLabels}`,
  };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

export function getValidTransitions(status: DealStatus): DealStatus[] {
  return [...VALID_TRANSITIONS[status]];
}
