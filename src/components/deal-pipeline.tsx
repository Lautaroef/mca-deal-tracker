"use client";

import { CheckIcon } from "lucide-react";
import {
  PIPELINE_SEGMENTS,
  SEGMENT_COLORS,
  getStatusInfo,
  getSegmentIndex,
} from "@/components/status-badge";
import type { StatusSegment } from "@/server/lib/status-machine";

interface DealPipelineProps {
  status: string;
}

export function DealPipeline({ status }: DealPipelineProps) {
  const info = getStatusInfo(status);
  const isDead = status === "dead";
  const currentSegmentIndex = info
    ? getSegmentIndex(info.segment)
    : -1;

  return (
    <div className="relative">
      {isDead && (
        <div className="mb-2 text-center">
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
            Deal is Dead
          </span>
        </div>
      )}
      <div className="flex items-center gap-1">
        {PIPELINE_SEGMENTS.map((segment, index) => {
          const isCompleted = !isDead && index < currentSegmentIndex;
          const isCurrent = !isDead && index === currentSegmentIndex;
          const isFuture = isDead || index > currentSegmentIndex;

          return (
            <div key={segment} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`
                  flex h-8 w-full items-center justify-center rounded-md text-xs font-medium transition-colors
                  ${index === 0 ? "rounded-l-full" : ""}
                  ${index === PIPELINE_SEGMENTS.length - 1 ? "rounded-r-full" : ""}
                  ${isDead ? "bg-muted text-muted-foreground opacity-50" : ""}
                  ${isCompleted ? getSegmentBg(segment) : ""}
                  ${isCurrent ? `${getSegmentBg(segment)} ring-2 ring-offset-1 ring-offset-background ${getSegmentRing(segment)}` : ""}
                  ${isFuture && !isDead ? "bg-muted text-muted-foreground" : ""}
                `}
              >
                {isCompleted ? (
                  <CheckIcon className="size-3.5" />
                ) : (
                  <span className="hidden sm:inline truncate px-1">{segment}</span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground truncate max-w-full sm:hidden">
                {segment.slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getSegmentBg(segment: StatusSegment): string {
  const map: Record<StatusSegment, string> = {
    Intake: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    Submission: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    Negotiating: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    Closing: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    Funded: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    Terminal: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  return map[segment];
}

function getSegmentRing(segment: StatusSegment): string {
  const map: Record<StatusSegment, string> = {
    Intake: "ring-blue-400",
    Submission: "ring-yellow-400",
    Negotiating: "ring-purple-400",
    Closing: "ring-orange-400",
    Funded: "ring-green-400",
    Terminal: "ring-red-400",
  };
  return map[segment];
}
