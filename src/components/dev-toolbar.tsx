"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { UserIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  workspaceId: string;
}

interface WorkspaceGroup {
  workspaceId: string;
  workspaceName: string;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    workspaceId: string;
    workspaceName: string;
  }>;
}

export function DevToolbar() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth").then((r) => (r.ok ? r.json() : { user: null })),
      fetch("/api/auth/users").then((r) => (r.ok ? r.json() : { workspaces: [] })),
    ])
      .then(([authData, usersData]) => {
        setCurrentUser(authData.user ?? null);
        setWorkspaces(usersData.workspaces ?? []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  async function switchUser(userId: string) {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    window.location.reload();
  }

  if (loading) return null;

  const currentWorkspace = workspaces.find(
    (ws) => ws.workspaceId === currentUser?.workspaceId,
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-t-amber-500 bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80">
      {collapsed ? (
        <div className="flex items-center justify-between px-4 py-1.5">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] px-1.5 py-0">
              DEV
            </Badge>
            {currentUser && (
              <span className="text-muted-foreground">{currentUser.name}</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setCollapsed(false)}
          >
            <ChevronUpIcon className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="px-4 py-2">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <UserIcon className="size-3.5" />
                <span>Dev Auth</span>
                <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] px-1.5 py-0">
                  DEV
                </Badge>
              </div>
              {currentUser ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{currentUser.name}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {currentUser.role}
                  </span>
                  {currentWorkspace && (
                    <span className="text-muted-foreground">
                      {currentWorkspace.workspaceName}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">No user selected</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={currentUser?.id ?? undefined}
                onValueChange={(value) => {
                  if (value) switchUser(value);
                }}
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Switch user..." />
                </SelectTrigger>
                <SelectContent side="top" align="end">
                  {workspaces.map((ws) => (
                    <SelectGroup key={ws.workspaceId}>
                      <SelectLabel>{ws.workspaceName}</SelectLabel>
                      {ws.users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({user.role})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setCollapsed(true)}
              >
                <ChevronDownIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
