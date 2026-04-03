"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftIcon, PencilIcon, TrashIcon } from "lucide-react";
import { DealForm } from "@/components/deal-form";
import { ActivityTimeline } from "@/components/activity-timeline";
import {
  DEAL_STATUSES,
  VALID_TRANSITIONS,
  type DealStatus,
  type StatusSegment,
} from "@/server/lib/status-machine";

const SEGMENT_COLORS: Record<StatusSegment, string> = {
  Intake: "bg-blue-100 text-blue-800",
  Submission: "bg-yellow-100 text-yellow-800",
  Negotiating: "bg-purple-100 text-purple-800",
  Closing: "bg-orange-100 text-orange-800",
  Funded: "bg-green-100 text-green-800",
  Terminal: "bg-red-100 text-red-800",
};

function getStatusInfo(status: string) {
  return DEAL_STATUSES.find((s) => s.value === status);
}

function StatusBadge({ status }: { status: string }) {
  const info = getStatusInfo(status);
  if (!info) return <span>{status}</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${SEGMENT_COLORS[info.segment]}`}
    >
      {info.label}
    </span>
  );
}

function formatCurrency(amount: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(Number(amount));
}

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dealId = params.id as string;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    data: deal,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["deals", "getById", dealId],
    queryFn: () => trpc.deals.getById.query({ id: dealId }),
  });

  const { data: events } = useQuery({
    queryKey: ["deals", "getActivity", dealId],
    queryFn: () => trpc.deals.getActivity.query({ dealId }),
    enabled: !!deal,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      trpc.deals.updateStatus.mutate({ id: dealId, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Status updated");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      merchantName?: string;
      merchantEmail?: string;
      merchantPhone?: string;
      requestedAmount?: number;
      notes?: string;
    }) =>
      trpc.deals.update.mutate({ id: dealId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      setEditOpen(false);
      toast.success("Deal updated");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => trpc.deals.delete.mutate({ id: dealId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Deal archived");
      router.push("/deals");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 pb-20">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 pb-20">
        <p className="text-destructive">
          {error?.message ?? "Deal not found"}
        </p>
        <Button
          variant="ghost"
          onClick={() => router.push("/deals")}
          className="mt-4"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to Deals
        </Button>
      </div>
    );
  }

  const currentStatus = deal.status as DealStatus;
  const validTransitions =
    VALID_TRANSITIONS[currentStatus] ?? ([] as readonly DealStatus[]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-20">
      {/* Back link */}
      <Button
        variant="ghost"
        onClick={() => router.push("/deals")}
        className="mb-4"
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Back to Deals
      </Button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{deal.merchantName}</h1>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={deal.status} />
            <span className="text-sm text-muted-foreground">
              {formatCurrency(deal.requestedAmount)}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm">
                  <PencilIcon data-icon="inline-start" />
                  Edit
                </Button>
              }
            />
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Deal</DialogTitle>
              </DialogHeader>
              <DealForm
                mode="edit"
                defaultValues={{
                  merchantName: deal.merchantName,
                  merchantEmail: deal.merchantEmail ?? undefined,
                  merchantPhone: deal.merchantPhone ?? undefined,
                  requestedAmount: Number(deal.requestedAmount),
                  notes: deal.notes ?? undefined,
                }}
                onSubmit={(data) => updateMutation.mutate(data)}
                isSubmitting={updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger
              render={
                <Button variant="destructive" size="sm">
                  <TrashIcon data-icon="inline-start" />
                  Delete
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Archive Deal</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to archive &quot;{deal.merchantName}
                &quot;? This deal will be removed from your list but preserved
                in the database.
              </p>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Archiving..." : "Archive"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Deal Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{deal.merchantEmail ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{deal.merchantPhone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Amount</dt>
              <dd>{formatCurrency(deal.requestedAmount)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={deal.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(deal.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{formatDate(deal.updatedAt)}</dd>
            </div>
            {deal.notes && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-wrap">{deal.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Status Transitions */}
      {validTransitions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Status Transitions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {validTransitions.map((nextStatus) => {
                const info = getStatusInfo(nextStatus);
                return (
                  <Button
                    key={nextStatus}
                    variant="outline"
                    size="sm"
                    onClick={() => statusMutation.mutate(nextStatus)}
                    disabled={statusMutation.isPending}
                  >
                    {info?.label ?? nextStatus}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      <Separator className="my-6" />
      <h2 className="mb-4 text-lg font-semibold">Activity</h2>
      {events ? (
        <ActivityTimeline
          events={events.map((e) => ({
            ...e,
            metadata: e.metadata as Record<string, unknown>,
            createdAt:
              typeof e.createdAt === "string"
                ? e.createdAt
                : (e.createdAt as Date).toISOString(),
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Loading activity...</p>
      )}
    </div>
  );
}
