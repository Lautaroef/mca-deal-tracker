"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboardIcon } from "lucide-react";

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

export function AppHeader() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceGroup[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth").then((r) => (r.ok ? r.json() : { user: null })),
      fetch("/api/auth/users").then((r) => (r.ok ? r.json() : { workspaces: [] })),
    ])
      .then(([authData, usersData]) => {
        setCurrentUser(authData.user ?? null);
        setWorkspaces(usersData.workspaces ?? []);
      })
      .catch(() => {
        // Silently handle fetch failures (e.g., during server restart)
      });
  }, []);

  const currentWorkspace = workspaces.find(
    (ws) => ws.workspaceId === currentUser?.workspaceId,
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/deals" className="flex items-center gap-2 font-semibold tracking-tight">
            <LayoutDashboardIcon className="size-5 text-primary" />
            <span>MCA Pilot</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/deals"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
            >
              Deals
            </Link>
          </nav>
        </div>

        {currentUser && currentWorkspace && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {currentWorkspace.workspaceName}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {currentUser.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <span className="hidden sm:inline font-medium">{currentUser.name}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
