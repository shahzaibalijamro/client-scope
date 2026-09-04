import { z } from "zod";

const trimmed = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);
export const email = z.string().trim().max(254).email();
export const password = z.string().min(12).max(128);
export const objectId = z.string().regex(/^[a-f\d]{24}$/iu, "Invalid identifier.");
export const displayName = trimmed(1, 80);
export const name = trimmed(1, 120);
export const optionalName = z.string().trim().max(120).transform((value) => value || undefined).optional();
export const optionalEmail = z.union([email, z.literal("")]).transform((value) => value || undefined).optional();
export const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || undefined).optional();
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Use a calendar date in YYYY-MM-DD format.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "Use a valid calendar date.");
