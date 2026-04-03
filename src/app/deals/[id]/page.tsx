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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon,
  MailIcon,
  PhoneIcon,
  LoaderCircleIcon,
  UndoIcon,
  RotateCcwIcon,
  AlertTriangleIcon,
} from "lucide-react";
import Link from "next/link";
import { DealForm } from "@/components/deal-form";
import { ActivityTimeline } from "@/components/activity-timeline";
import { DealPipeline } from "@/components/deal-pipeline";
import { StatusBadge, getStatusInfo } from "@/components/status-badge";
import { formatCurrency, formatDateTime, getUserInitials } from "@/lib/format";
import {
  VALID_TRANSITIONS,
  DEAL_STATUSES,
  type DealStatus,
} from "@/server/lib/status-machine";

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dealId = params.id as string;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deadConfirmOpen, setDeadConfirmOpen] = useState(false);

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

  const { data: workspaceUsers } = useQuery({
    queryKey: ["deals", "listUsers"],
    queryFn: () => trpc.deals.listUsers.query(),
    enabled: !!deal,
  });

  const statusMutation = useMutation({
    mutationFn: (status: DealStatus) =>
      trpc.deals.updateStatus.mutate({ id: dealId, status }),
    onSuccess: (_data, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      const info = getStatusInfo(newStatus);
      toast.success(
        `Status updated: ${getStatusInfo(deal?.status ?? "")?.label ?? deal?.status} → ${info?.label ?? newStatus}`,
      );
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
      toast.success(`Deal archived: ${deal?.merchantName}`);
      router.push("/deals");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 pb-20">
        <Skeleton className="h-4 w-32 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          <div className="space-y-6">
            <div className="space-y-3">
              <Skeleton className="h-8 w-64" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-16" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-56" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-full" />
                <div className="flex gap-2 mt-4">
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-16" />
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="size-7 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 pb-20">
        <p className="text-destructive">
          {error?.message ?? "Deal not found"}
        </p>
        <Button
          variant="ghost"
          onClick={() => router.push("/deals")}
          className="mt-4"
        >
          Back to Deals
        </Button>
      </div>
    );
  }

  const currentStatus = deal.status as DealStatus;
  const validTransitions =
    VALID_TRANSITIONS[currentStatus] ?? ([] as readonly DealStatus[]);
  const assignedUserName = workspaceUsers?.find(
    (u) => u.id === deal.assignedUserId,
  )?.name;

  function getTransitionVariant(
    targetStatus: DealStatus,
  ): "default" | "outline" | "destructive" {
    if (targetStatus === "dead") return "destructive";

    const currentIdx = DEAL_STATUSES.findIndex(
      (s) => s.value === currentStatus,
    );
    const targetIdx = DEAL_STATUSES.findIndex(
      (s) => s.value === targetStatus,
    );

    if (targetIdx < currentIdx) return "outline"; // backward
    return "default"; // forward
  }

  function getTransitionIcon(targetStatus: DealStatus) {
    if (targetStatus === "dead") return null;

    const currentIdx = DEAL_STATUSES.findIndex(
      (s) => s.value === currentStatus,
    );
    const targetIdx = DEAL_STATUSES.findIndex(
      (s) => s.value === targetStatus,
    );

    if (targetIdx < currentIdx) {
      return <UndoIcon data-icon="inline-start" />;
    }
    if (currentStatus === "dead" && targetStatus === "lead") {
      return <RotateCcwIcon data-icon="inline-start" />;
    }
    return null;
  }

  function handleTransitionClick(targetStatus: DealStatus) {
    if (targetStatus === "dead") {
      setDeadConfirmOpen(true);
    } else {
      statusMutation.mutate(targetStatus);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 pb-20">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/deals" />}>
              Deals
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{deal.merchantName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {deal.merchantName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusBadge status={deal.status} />
            <span className="text-lg font-semibold">
              {formatCurrency(deal.requestedAmount)}
            </span>
            {assignedUserName && (
              <div className="flex items-center gap-1.5">
                <Avatar size="sm">
                  <AvatarFallback>
                    {getUserInitials(assignedUserName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">
                  {assignedUserName}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon-sm">
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
                <TrashIcon />
                Archive Deal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
                  {deleteMutation.isPending ? (
                    <>
                      <LoaderCircleIcon className="size-4 animate-spin" />
                      Archiving...
                    </>
                  ) : (
                    "Archive"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left column: Details + Status */}
        <div className="space-y-6">
          {/* Deal Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Contact info */}
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <MailIcon className="size-4 text-muted-foreground" />
                  <span>{deal.merchantEmail ?? "No email"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <PhoneIcon className="size-4 text-muted-foreground" />
                  <span>{deal.merchantPhone ?? "No phone"}</span>
                </div>
              </div>

              {/* Notes */}
              {deal.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Notes
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{deal.notes}</p>
                </div>
              )}

              {/* Metadata */}
              <div className="flex gap-4 pt-2 border-t text-xs text-muted-foreground">
                <span>Created {formatDateTime(deal.createdAt)}</span>
                <span>Updated {formatDateTime(deal.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Pipeline + Status Transitions */}
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DealPipeline status={deal.status} />

              {validTransitions.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-3">
                    Available Transitions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {validTransitions.map((nextStatus) => {
                      const info = getStatusInfo(nextStatus);
                      const variant = getTransitionVariant(nextStatus);
                      const icon = getTransitionIcon(nextStatus);
                      return (
                        <Button
                          key={nextStatus}
                          variant={variant}
                          size="sm"
                          onClick={() => handleTransitionClick(nextStatus)}
                          disabled={statusMutation.isPending}
                        >
                          {statusMutation.isPending ? (
                            <LoaderCircleIcon className="size-3.5 animate-spin" />
                          ) : (
                            icon
                          )}
                          {info?.label ?? nextStatus}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Activity */}
        <div>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Activity</CardTitle>
                {events && (
                  <Badge variant="secondary" className="text-xs">
                    {events.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {events ? (
                <ActivityTimeline
                  events={events.map((e) => ({
                    ...e,
                    metadata: e.metadata as Record<string, unknown>,
                    actorName: e.actorName,
                  }))}
                />
              ) : (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="size-7 rounded-full" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dead Confirmation Dialog */}
      <Dialog open={deadConfirmOpen} onOpenChange={setDeadConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-destructive" />
              Mark Deal as Dead
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to mark &quot;{deal.merchantName}&quot; as
            Dead? This will move the deal to the terminal state. You can
            resurrect it later by transitioning back to Lead.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setDeadConfirmOpen(false);
                statusMutation.mutate("dead");
              }}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending ? (
                <>
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Mark as Dead"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
