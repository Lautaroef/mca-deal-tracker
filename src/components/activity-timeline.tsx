"use client";

import { useState } from "react";
import {
  PlusCircleIcon,
  ArrowRightIcon,
  UserIcon,
  TrashIcon,
  PencilIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimestamp, formatRelativeTime } from "@/lib/format";

interface EventEntry {
  id: string;
  eventType: string;
  metadata: Record<string, unknown>;
  actorId: string;
  actorName?: string;
  createdAt: string | Date;
}

interface ActivityTimelineProps {
  events: EventEntry[];
}

const EVENT_TYPE_STYLES: Record<string, string> = {
  deal_created: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400",
  status_changed: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  deal_assigned: "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
  deal_updated: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  deal_deleted: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
};

function EventIcon({ type }: { type: string }) {
  const className = "size-3.5";
  switch (type) {
    case "deal_created":
      return <PlusCircleIcon className={className} />;
    case "status_changed":
      return <ArrowRightIcon className={className} />;
    case "deal_assigned":
      return <UserIcon className={className} />;
    case "deal_deleted":
      return <TrashIcon className={className} />;
    case "deal_updated":
      return <PencilIcon className={className} />;
    default:
      return <PlusCircleIcon className={className} />;
  }
}

function eventDescription(event: EventEntry): string {
  const meta = event.metadata;
  const actor = event.actorName ?? "Someone";

  switch (event.eventType) {
    case "deal_created":
      return `${actor} created this deal`;
    case "status_changed":
      return `${actor} changed status from ${meta.old_status_label ?? meta.old_status} to ${meta.new_status_label ?? meta.new_status}`;
    case "deal_assigned": {
      const from = meta.old_user_name ?? "unassigned";
      const to = meta.new_user_name ?? "unknown";
      return `${actor} reassigned from ${from} to ${to}`;
    }
    case "deal_deleted":
      return `${actor} archived this deal`;
    case "deal_updated": {
      const changes = meta.changes as
        | Array<{ field: string; old_value: string | null; new_value: string | null }>
        | undefined;
      if (!changes?.length) return `${actor} updated this deal`;
      const fields = changes.map((c) => c.field.replace(/_/g, " ")).join(", ");
      return `${actor} updated: ${fields}`;
    }
    default:
      return event.eventType.replace(/_/g, " ");
  }
}

function MetadataDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1">
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setExpanded(!expanded)}
        className="h-auto px-1 py-0.5 text-xs text-muted-foreground"
      >
        {expanded ? (
          <ChevronDownIcon data-icon="inline-start" />
        ) : (
          <ChevronRightIcon data-icon="inline-start" />
        )}
        Metadata
      </Button>
      {expanded && (
        <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (!events.length) {
    return (
      <p className="py-4 text-sm text-muted-foreground">No activity yet.</p>
    );
  }

  return (
    <div className="relative space-y-0">
      {events.map((event, index) => (
        <div key={event.id} className="relative flex gap-3 pb-6">
          {/* Vertical line */}
          {index < events.length - 1 && (
            <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />
          )}

          {/* Icon */}
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-full ${EVENT_TYPE_STYLES[event.eventType] ?? "border bg-background text-muted-foreground"}`}
          >
            <EventIcon type={event.eventType} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm">{eventDescription(event)}</p>
            <p
              className="text-xs text-muted-foreground"
              title={formatTimestamp(event.createdAt)}
            >
              {formatRelativeTime(event.createdAt)}
            </p>
            <MetadataDetails metadata={event.metadata} />
          </div>
        </div>
      ))}
    </div>
  );
}
