import { expect, test } from "@playwright/test";

test("canonical demo entry exposes both roles and all three project stories", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to your work" })).toBeVisible();
  await expect(page.getByText("Explore the shared demo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).not.toBeVisible();

  await page.getByRole("button", { name: "Use Workspace Owner" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Good to see you, Avery/u })).toBeVisible();
  await expect(page.getByText(/Shared portfolio demo/u)).toBeVisible();
  await expect(page.getByRole("button", { name: /Harbor Website Launch/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Atlas Client Portal/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cedar Brand Archive/u })).toBeVisible();
  await expect(page.getByRole("button", { name: "New workspace" })).not.toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Use Client Approver" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Good to see you, Jordan/u })).toBeVisible();
  await page.getByRole("button", { name: /Harbor Website Launch/u }).click();
  await expect(page).toHaveURL(/\/projects\/[a-f\d]{24}\/overview/u);
  await expect(page.getByText(/decision required/i).first()).toBeVisible();
});
