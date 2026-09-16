"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import { announceToast, DirtyNavigationProvider, ToastRegion } from "./ui-foundation";

export function QueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onSuccess: (data) => {
            if (!data || typeof data !== "object") return;
            const result = data as { message?: unknown; warning?: unknown };
            // Verification already owns a persistent inline status beside its continuation action.
            if (typeof result.message === "string" && result.message !== "Email verified.") announceToast(result.message);
            if (typeof result.warning === "string") announceToast(result.warning, "warning");
          },
        }),
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    const refresh = () => {
      announceToast("The shared demo was refreshed. Canonical project data has been reloaded.", "warning");
      void queryClient.invalidateQueries();
    };
    window.addEventListener("clientscope:demo-generation", refresh);
    return () => window.removeEventListener("clientscope:demo-generation", refresh);
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}><DirtyNavigationProvider>{children}<ToastRegion /></DirtyNavigationProvider></QueryClientProvider>;
}
