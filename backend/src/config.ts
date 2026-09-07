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
  FRONTEND_ORIGIN: z.string().url().refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "FRONTEND_ORIGIN must use http or https.",
  ).refine((value) => new URL(value).origin === value, "FRONTEND_ORIGIN must be an origin without a path, query, or trailing slash."),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must contain at least 32 characters."),
  AUTH_THROTTLE_LIMIT: z.string().regex(/^\d+$/u).transform(Number).pipe(z.number().int().min(1).max(10_000)),
  EMAIL_DELIVERY_MODE: z.enum(["local", "fail", "gmail"]),
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().min(1).optional(),
  EMAIL_FROM_NAME: z.string().trim().min(1).max(120).optional(),
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
    FRONTEND_ORIGIN: environment.FRONTEND_ORIGIN,
    SESSION_SECRET: environment.SESSION_SECRET,
    AUTH_THROTTLE_LIMIT: environment.AUTH_THROTTLE_LIMIT,
    EMAIL_DELIVERY_MODE: environment.EMAIL_DELIVERY_MODE,
    GMAIL_USER: environment.GMAIL_USER || undefined,
    GMAIL_APP_PASSWORD: environment.GMAIL_APP_PASSWORD || undefined,
    EMAIL_FROM_NAME: environment.EMAIL_FROM_NAME || undefined,
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
