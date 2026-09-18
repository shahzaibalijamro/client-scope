import { expect, test } from "@playwright/test";

const viewports = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test("authentication surfaces use the responsive indigo visual system", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in to your work" })).toBeVisible();
    await expect(page.locator(".brand-panel")).toBeVisible({ visible: viewport.width > 820 });
    await expect(page.locator(".auth-mobile-brand")).toBeVisible({ visible: viewport.width <= 820 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Start with a verified account" })).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Request a reset link" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(page.getByText("This reset link is unavailable.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.goto("/verify");
  await expect(page.getByRole("heading", { name: "Confirm this email address" })).toBeVisible();
  await expect(page.getByText("This verification link is unavailable.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
