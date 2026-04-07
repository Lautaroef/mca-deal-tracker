"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  PlusIcon,
  SearchIcon,
  InboxIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react";
import { DealForm } from "@/components/deal-form";
import { StatusBadge, getStatusInfo } from "@/components/status-badge";
import { formatCurrency, formatDate, getUserInitials } from "@/lib/format";
import type { StatusSegment } from "@/server/lib/status-machine";

type SortField = "amount" | "created";
type SortDir = "asc" | "desc";

const SEGMENT_TABS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "Intake", label: "Intake" },
  { value: "Submission", label: "Submission" },
  { value: "Negotiating", label: "Negotiating" },
  { value: "Closing", label: "Closing" },
  { value: "Funded", label: "Funded" },
  { value: "Terminal", label: "Dead" },
];

export default function DealsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: deals, isLoading, error } = useQuery({
    queryKey: ["deals", "list"],
    queryFn: () => trpc.deals.list.query(),
    retry: false,
  });

  const isUnauthorized =
    error instanceof Error && /logged in|UNAUTHORIZED/i.test(error.message);

  const { data: workspaceUsers } = useQuery({
    queryKey: ["deals", "listUsers"],
    queryFn: () => trpc.deals.listUsers.query(),
  });

  const userMap = useMemo(() => {
    if (!workspaceUsers) return new Map<string, string>();
    return new Map(workspaceUsers.map((u) => [u.id, u.name]));
  }, [workspaceUsers]);

  const createMutation = useMutation({
    mutationFn: (input: {
      merchantName: string;
      merchantEmail?: string;
      merchantPhone?: string;
      requestedAmount: number;
      notes?: string;
      assignedUserId?: string;
    }) => trpc.deals.create.mutate(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      setCreateOpen(false);
      toast.success(`Deal created: ${variables.merchantName}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const filteredDeals = useMemo(() => {
    if (!deals) return [];
    let result = deals;

    // Filter by search
    if (search.trim()) {
      const term = search.toLowerCase().trim();
      result = result.filter(
        (d) =>
          d.merchantName.toLowerCase().includes(term) ||
          (d.merchantEmail && d.merchantEmail.toLowerCase().includes(term)),
      );
    }

    // Filter by segment
    if (activeTab !== "all") {
      result = result.filter((d) => {
        const info = getStatusInfo(d.status);
        return info?.segment === activeTab;
      });
    }

    // Sort
    if (sortField) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sortField === "amount") {
          cmp = Number(a.requestedAmount) - Number(b.requestedAmount);
        } else if (sortField === "created") {
          cmp =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [deals, search, activeTab, sortField, sortDir]);

  const segmentCounts = useMemo(() => {
    if (!deals) return {};
    const counts: Record<string, number> = { all: deals.length };
    for (const d of deals) {
      const info = getStatusInfo(d.status);
      if (info) {
        counts[info.segment] = (counts[info.segment] ?? 0) + 1;
      }
    }
    return counts;
  }, [deals]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return null;
    return sortDir === "asc" ? (
      <ArrowUpIcon className="inline size-3" />
    ) : (
      <ArrowDownIcon className="inline size-3" />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 pb-20">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
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

      {/* Search + Filter */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search merchants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" className="mb-4 w-full flex-wrap">
          {SEGMENT_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {segmentCounts[tab.value] !== undefined && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({segmentCounts[tab.value]})
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Single content for all tabs since we filter in useMemo */}
        {SEGMENT_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {isLoading ? (
              <DealTableSkeleton />
            ) : isUnauthorized ? (
              <NotLoggedInState />
            ) : filteredDeals.length === 0 ? (
              <EmptyState
                hasDeals={!!deals?.length}
                onCreateClick={() => setCreateOpen(true)}
              />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-4">Merchant Name</TableHead>
                        <TableHead
                          className="px-4 cursor-pointer select-none"
                          onClick={() => toggleSort("amount")}
                        >
                          Amount <SortIcon field="amount" />
                        </TableHead>
                        <TableHead className="px-4">Status</TableHead>
                        <TableHead className="px-4">Assigned To</TableHead>
                        <TableHead
                          className="px-4 cursor-pointer select-none"
                          onClick={() => toggleSort("created")}
                        >
                          Created <SortIcon field="created" />
                        </TableHead>
                        <TableHead className="w-8 px-4" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeals.map((deal) => (
                        <TableRow
                          key={deal.id}
                          className="group cursor-pointer"
                          onClick={() => router.push(`/deals/${deal.id}`)}
                        >
                          <TableCell className="px-4 py-3 font-medium">
                            {deal.merchantName}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            {formatCurrency(deal.requestedAmount)}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <StatusBadge status={deal.status} />
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <AssignedUser
                              name={userMap.get(deal.assignedUserId)}
                            />
                          </TableCell>
                          <TableCell className="px-4 py-3 text-muted-foreground">
                            {formatDate(deal.createdAt)}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <ChevronRightIcon className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card List */}
                <div className="md:hidden space-y-3">
                  {filteredDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="rounded-lg border bg-card p-4 cursor-pointer active:bg-muted/50 transition-colors"
                      onClick={() => router.push(`/deals/${deal.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {deal.merchantName}
                          </p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {formatCurrency(deal.requestedAmount)}
                          </p>
                        </div>
                        <StatusBadge status={deal.status} />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <AssignedUser
                          name={userMap.get(deal.assignedUserId)}
                        />
                        <span>{formatDate(deal.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function AssignedUser({ name }: { name?: string }) {
  if (!name) {
    return (
      <span className="text-xs text-muted-foreground">Unassigned</span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Avatar size="sm">
        <AvatarFallback>{getUserInitials(name)}</AvatarFallback>
      </Avatar>
      <span className="text-sm">{name}</span>
    </div>
  );
}

function DealTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-[180px]" />
          <Skeleton className="h-4 w-[80px]" />
          <Skeleton className="h-5 w-[90px] rounded-full" />
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-4 w-[60px]" />
          <Skeleton className="h-4 w-[80px]" />
        </div>
      ))}
    </div>
  );
}

function NotLoggedInState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted mb-4">
        <InboxIcon className="size-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium">Select a user to get started</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        Use the dev toolbar at the bottom of the screen to pick a user and
        explore the deal pipeline.
      </p>
    </div>
  );
}

function EmptyState({
  hasDeals,
  onCreateClick,
}: {
  hasDeals: boolean;
  onCreateClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted mb-4">
        <InboxIcon className="size-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium">
        {hasDeals ? "No matching deals" : "No deals yet"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        {hasDeals
          ? "Try adjusting your search or filter to find what you're looking for."
          : "Create your first deal to get started tracking your pipeline."}
      </p>
      {!hasDeals && (
        <Button className="mt-4" onClick={onCreateClick}>
          <PlusIcon data-icon="inline-start" />
          New Deal
        </Button>
      )}
    </div>
  );
}
