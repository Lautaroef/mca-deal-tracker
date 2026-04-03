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
import { UserIcon } from "lucide-react";

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

  useEffect(() => {
    Promise.all([
      fetch("/api/auth").then((r) => r.json()),
      fetch("/api/auth/users").then((r) => r.json()),
    ]).then(([authData, usersData]) => {
      setCurrentUser(authData.user ?? null);
      setWorkspaces(usersData.workspaces ?? []);
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
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80 px-4 py-2">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <UserIcon className="size-3.5" />
            <span>Dev Auth</span>
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

        <Select
          value={currentUser?.id ?? undefined}
          onValueChange={(value) => {
            if (value) switchUser(value);
          }}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Switch user..." />
          </SelectTrigger>
          <SelectContent>
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
      </div>
    </div>
  );
}
