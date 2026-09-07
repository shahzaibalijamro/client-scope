import type { NextConfig } from "next";
import { z } from "zod";

const serverEnvironmentSchema = z.object({
  BACKEND_API_ORIGIN: z
    .string({ message: "BACKEND_API_ORIGIN is required." })
    .url("BACKEND_API_ORIGIN must be an absolute URL.")
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
      message: "BACKEND_API_ORIGIN must use http or https.",
    })
    .refine((value) => new URL(value).origin === value, {
      message: "BACKEND_API_ORIGIN must be an origin without a path, query, or trailing slash.",
    }),
});

function readBackendOrigin(): string {
  const result = serverEnvironmentSchema.safeParse({
    BACKEND_API_ORIGIN: process.env.BACKEND_API_ORIGIN,
  });

  if (!result.success) {
    const problems = result.error.issues.map((issue) => issue.message).join(" ");
    throw new Error(`Invalid frontend configuration: ${problems}`);
  }

  return result.data.BACKEND_API_ORIGIN;
}

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  async rewrites() {
    const backendOrigin = readBackendOrigin();

    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
