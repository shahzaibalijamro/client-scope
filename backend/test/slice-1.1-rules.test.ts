import { describe, expect, it } from "vitest";

import { hashPassword, hashToken, normalizeEmail, randomToken, verifyPassword } from "../src/domain/security.js";
import { dateOnly, displayName, email, password } from "../src/domain/validation.js";

describe("Slice 1.1 identity boundaries", () => {
  it("normalizes email without provider-specific rewriting", () => {
    expect(normalizeEmail("  Person.Name+work@Example.COM  ")).toBe("person.name+work@example.com");
    expect(email.parse(" Person@example.com ")).toBe("Person@example.com");
  });

  it("preserves password spaces and enforces the approved length", async () => {
    const value = "  twelve chars ✓  ";
    expect(password.parse(value)).toBe(value);
    const hash = await hashPassword(value);
    expect(hash).not.toContain(value);
    await expect(verifyPassword(hash, value)).resolves.toBe(true);
    await expect(verifyPassword(hash, value.trim())).resolves.toBe(false);
    expect(() => password.parse("short")).toThrow();
  });

  it("creates opaque tokens and stores a non-recoverable representation", () => {
    const token = randomToken();
    expect(token.length).toBeGreaterThan(40);
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("accepts real date-only values including past dates", () => {
    expect(dateOnly.parse("2020-02-29")).toBe("2020-02-29");
    expect(() => dateOnly.parse("2021-02-29")).toThrow();
    expect(() => dateOnly.parse("2026-09-04T00:00:00Z")).toThrow();
  });

  it("trims names without silently truncating them", () => {
    expect(displayName.parse("  Ada Lovelace  ")).toBe("Ada Lovelace");
    expect(() => displayName.parse(" ")).toThrow();
    expect(() => displayName.parse("x".repeat(81))).toThrow();
  });
});
