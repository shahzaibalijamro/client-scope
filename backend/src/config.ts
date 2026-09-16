import { z } from "zod";

const positiveInteger = z.string().regex(/^\d+$/u).transform(Number).pipe(z.number().int().positive());
const demoPassword = z.string().min(12).max(128).refine(
  (value) => !/replace|example|password|demo-password/iu.test(value),
  "must not be a documented example or placeholder",
);
const demoFolder = z.string().trim().regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+$/u, "must be an isolated Cloudinary folder path").refine(
  (value) => !/(?:^|\/)(?:private|portfolio)(?:\/|$)/iu.test(value),
  "must be separate from private uploads and public portfolio media",
);

export type DemoConfig = Readonly<
  | { state: "disabled" }
  | { state: "invalid"; problems: readonly string[] }
  | {
      state: "enabled";
      tenantId: string;
      owner: Readonly<{ label: "Workspace Owner"; email: string; password: string }>;
      approver: Readonly<{ label: "Client Approver"; email: string; password: string }>;
      resetSecret: string;
      cloudinaryFolder: string;
      quotas: Readonly<{
        emailsPerUserHour: number; aiRequestsPerUserHour: number; uploadMibPerUserHour: number;
        emailsPerDay: number; aiRequestsPerDay: number; uploadMibPerDay: number;
      }>;
    }
>;

const enabledDemoSchema = z.object({
  DEMO_TENANT_ID: z.string().regex(/^[a-f\d]{24}$/iu, "must be a MongoDB ObjectId"),
  DEMO_OWNER_EMAIL: z.string().trim().email(),
  DEMO_OWNER_PASSWORD: demoPassword,
  DEMO_APPROVER_EMAIL: z.string().trim().email(),
  DEMO_APPROVER_PASSWORD: demoPassword,
  DEMO_RESET_SECRET: z.string().min(32).max(512),
  DEMO_CLOUDINARY_FOLDER: demoFolder,
  DEMO_EMAILS_PER_USER_HOUR: positiveInteger.default(3),
  DEMO_AI_REQUESTS_PER_USER_HOUR: positiveInteger.default(10),
  DEMO_UPLOAD_MIB_PER_USER_HOUR: positiveInteger.default(20),
  DEMO_EMAILS_PER_DAY: positiveInteger.default(30),
  DEMO_AI_REQUESTS_PER_DAY: positiveInteger.default(100),
  DEMO_UPLOAD_MIB_PER_DAY: positiveInteger.default(250),
}).superRefine((value, context) => {
  if (value.DEMO_OWNER_EMAIL.toLowerCase() === value.DEMO_APPROVER_EMAIL.toLowerCase()) {
    context.addIssue({ code: "custom", path: ["DEMO_APPROVER_EMAIL"], message: "must differ from DEMO_OWNER_EMAIL" });
  }
  if (value.DEMO_OWNER_PASSWORD === value.DEMO_APPROVER_PASSWORD) {
    context.addIssue({ code: "custom", path: ["DEMO_APPROVER_PASSWORD"], message: "must differ from DEMO_OWNER_PASSWORD" });
  }
  if ([value.DEMO_OWNER_PASSWORD, value.DEMO_APPROVER_PASSWORD].includes(value.DEMO_RESET_SECRET)) {
    context.addIssue({ code: "custom", path: ["DEMO_RESET_SECRET"], message: "must differ from both public demo passwords" });
  }
  if (value.DEMO_EMAILS_PER_DAY < value.DEMO_EMAILS_PER_USER_HOUR || value.DEMO_AI_REQUESTS_PER_DAY < value.DEMO_AI_REQUESTS_PER_USER_HOUR || value.DEMO_UPLOAD_MIB_PER_DAY < value.DEMO_UPLOAD_MIB_PER_USER_HOUR) {
    context.addIssue({ code: "custom", path: ["configuration"], message: "daily demo limits must not be lower than per-user hourly limits" });
  }
});

export function loadDemoConfig(environment: NodeJS.ProcessEnv): DemoConfig {
  if (!environment.DEMO_MODE_ENABLED || environment.DEMO_MODE_ENABLED === "false") return Object.freeze({ state: "disabled" });
  if (environment.DEMO_MODE_ENABLED !== "true") return Object.freeze({ state: "invalid", problems: ["DEMO_MODE_ENABLED: must be true or false"] });
  const result = enabledDemoSchema.safeParse(environment);
  if (!result.success) {
    return Object.freeze({
      state: "invalid",
      problems: result.error.issues.map((issue) => `${issue.path.join(".") || "configuration"}: ${issue.message}`),
    });
  }
  const value = result.data;
  return Object.freeze({
    state: "enabled", tenantId: value.DEMO_TENANT_ID.toLowerCase(),
    owner: Object.freeze({ label: "Workspace Owner", email: value.DEMO_OWNER_EMAIL.toLowerCase(), password: value.DEMO_OWNER_PASSWORD }),
    approver: Object.freeze({ label: "Client Approver", email: value.DEMO_APPROVER_EMAIL.toLowerCase(), password: value.DEMO_APPROVER_PASSWORD }),
    resetSecret: value.DEMO_RESET_SECRET, cloudinaryFolder: value.DEMO_CLOUDINARY_FOLDER.replace(/\/$/u, ""),
    quotas: Object.freeze({
      emailsPerUserHour: value.DEMO_EMAILS_PER_USER_HOUR, aiRequestsPerUserHour: value.DEMO_AI_REQUESTS_PER_USER_HOUR,
      uploadMibPerUserHour: value.DEMO_UPLOAD_MIB_PER_USER_HOUR, emailsPerDay: value.DEMO_EMAILS_PER_DAY,
      aiRequestsPerDay: value.DEMO_AI_REQUESTS_PER_DAY, uploadMibPerDay: value.DEMO_UPLOAD_MIB_PER_DAY,
    }),
  });
}

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
  AI_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().trim().min(1).max(120).default("gemini-2.5-flash"),
  AI_TIMEOUT_MS: z.string().regex(/^\d+$/u).transform(Number).pipe(z.number().int().min(1_000).max(30_000)).default(30_000),
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
    AI_ENABLED: environment.AI_ENABLED || undefined,
    GEMINI_API_KEY: environment.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: environment.GEMINI_MODEL || undefined,
    AI_TIMEOUT_MS: environment.AI_TIMEOUT_MS || undefined,
  });

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const field = issue.path.join(".") || "configuration";
      return `${field}: ${issue.message}`;
    });
    throw new ConfigurationError(problems);
  }

  if (result.data.AI_ENABLED && !result.data.GEMINI_API_KEY) {
    throw new ConfigurationError(["GEMINI_API_KEY: GEMINI_API_KEY is required when AI_ENABLED is true."]);
  }

  return Object.freeze(result.data);
}
