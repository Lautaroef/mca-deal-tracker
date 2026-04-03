"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import { useState, type ReactNode, createElement } from "react";
import type { AppRouter } from "@/server/trpc/router";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  // SSR — use localhost
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
    },
  });
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  return createElement(
    QueryClientProvider,
    { client: queryClient },
    children,
  );
}
