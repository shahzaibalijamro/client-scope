import { z } from "zod";

const configurationSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z
    .string()
    .regex(/^\d+$/, "PORT must be an integer between 1 and 65535.")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65_535)),
  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required.")
    .refine(
      (value) => /^mongodb(?:\+srv)?:\/\/[^\s]+$/u.test(value),
      "MONGODB_URI must be a valid MongoDB connection URI.",
    ),
});

export type AppConfig = Readonly<z.infer<typeof configurationSchema>>;

export class ConfigurationError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(`Invalid server configuration: ${problems.join(" ")}`);
    this.name = "ConfigurationError";
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = configurationSchema.safeParse({
    NODE_ENV: environment.NODE_ENV,
    PORT: environment.PORT,
    MONGODB_URI: environment.MONGODB_URI,
  });

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const field = issue.path.join(".") || "configuration";
      return `${field}: ${issue.message}`;
    });
    throw new ConfigurationError(problems);
  }

  return Object.freeze(result.data);
}
