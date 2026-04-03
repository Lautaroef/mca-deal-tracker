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

interface EventEntry {
  id: string;
  eventType: string;
  metadata: Record<string, unknown>;
  actorId: string;
  createdAt: string | Date;
}

interface ActivityTimelineProps {
  events: EventEntry[];
}

function formatTimestamp(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function EventIcon({ type }: { type: string }) {
  const className = "size-4";
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

  switch (event.eventType) {
    case "deal_created":
      return "Deal created";
    case "status_changed":
      return `Status changed from ${meta.old_status_label ?? meta.old_status} to ${meta.new_status_label ?? meta.new_status}`;
    case "deal_assigned": {
      const from = meta.old_user_name ?? "unassigned";
      const to = meta.new_user_name ?? "unknown";
      return `Deal reassigned from ${from} to ${to}`;
    }
    case "deal_deleted":
      return "Deal archived";
    case "deal_updated": {
      const changes = meta.changes as
        | Array<{ field: string; old_value: string | null; new_value: string | null }>
        | undefined;
      if (!changes?.length) return "Deal updated";
      const fields = changes.map((c) => c.field.replace(/_/g, " ")).join(", ");
      return `Updated: ${fields}`;
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
            <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
          )}

          {/* Icon */}
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
            <EventIcon type={event.eventType} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm">{eventDescription(event)}</p>
            <p className="text-xs text-muted-foreground">
              {formatTimestamp(event.createdAt)}
            </p>
            <MetadataDetails metadata={event.metadata} />
          </div>
        </div>
      ))}
    </div>
  );
}
