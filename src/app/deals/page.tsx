"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { DealForm } from "@/components/deal-form";
import {
  DEAL_STATUSES,
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
  if (!info) return <Badge variant="outline">{status}</Badge>;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SEGMENT_COLORS[info.segment]}`}
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
  }).format(new Date(date));
}

export default function DealsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: deals, isLoading } = useQuery({
    queryKey: ["deals", "list"],
    queryFn: () => trpc.deals.list.query(),
  });

  const createMutation = useMutation({
    mutationFn: (input: {
      merchantName: string;
      merchantEmail?: string;
      merchantPhone?: string;
      requestedAmount: number;
      notes?: string;
      assignedUserId?: string;
    }) => trpc.deals.create.mutate(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      setCreateOpen(false);
      toast.success("Deal created");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-20">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Deals</h1>
          {deals && (
            <p className="text-sm text-muted-foreground">
              {deals.length} deal{deals.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button>
                <PlusIcon data-icon="inline-start" />
                New Deal
              </Button>
            }
          />
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Deal</DialogTitle>
            </DialogHeader>
            <DealForm
              mode="create"
              onSubmit={(data) => createMutation.mutate(data)}
              isSubmitting={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading deals...
        </div>
      ) : !deals?.length ? (
        <div className="py-12 text-center text-muted-foreground">
          No deals found. Create one to get started.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant Name</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((deal) => (
              <TableRow
                key={deal.id}
                className="cursor-pointer"
                onClick={() => router.push(`/deals/${deal.id}`)}
              >
                <TableCell className="font-medium">
                  {deal.merchantName}
                </TableCell>
                <TableCell>{formatCurrency(deal.requestedAmount)}</TableCell>
                <TableCell>
                  <StatusBadge status={deal.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(deal.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
