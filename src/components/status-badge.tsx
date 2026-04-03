"use client";

import {
  DEAL_STATUSES,
  type StatusSegment,
} from "@/server/lib/status-machine";

export const SEGMENT_COLORS: Record<StatusSegment, string> = {
  Intake: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  Submission: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  Negotiating: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  Closing: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  Funded: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  Terminal: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

/** Ordered segments for pipeline display (excludes Terminal) */
export const PIPELINE_SEGMENTS: StatusSegment[] = [
  "Intake",
  "Submission",
  "Negotiating",
  "Closing",
  "Funded",
];

export function getStatusInfo(status: string) {
  return DEAL_STATUSES.find((s) => s.value === status);
}

export function getSegmentIndex(segment: StatusSegment): number {
  return PIPELINE_SEGMENTS.indexOf(segment);
}

export function StatusBadge({ status }: { status: string }) {
  const info = getStatusInfo(status);
  if (!info) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border">
        {status}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SEGMENT_COLORS[info.segment]}`}
    >
      {info.label}
    </span>
  );
}
