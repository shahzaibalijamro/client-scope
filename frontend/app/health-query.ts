import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

export const healthyResponseSchema = z
  .object({
    status: z.literal("ok"),
    database: z.literal("connected"),
  })
  .strict();

async function fetchHealth(): Promise<z.infer<typeof healthyResponseSchema>> {
  const response = await fetch("/api/v1/health", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("The service is unavailable.");
  }

  return healthyResponseSchema.parse(await response.json());
}

export const healthQueryOptions = queryOptions({
  queryKey: ["system-health"],
  queryFn: fetchHealth,
  retry: false,
  refetchInterval: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: Number.POSITIVE_INFINITY,
});
