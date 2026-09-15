import { expect, test } from "@playwright/test";

const password = "correct horse battery staple";
const origin = "http://127.0.0.1:4200";

async function mutate<T>(page: import("@playwright/test").Page, path: string, data: unknown): Promise<T> {
  const csrf = await (await page.request.get("/api/v1/csrf")).json() as { csrfToken: string };
  const response = await page.request.post(`/api/v1${path}`, { data, headers: { Origin: origin, "X-CSRF-Token": csrf.csrfToken } });
  if (!response.ok()) throw new Error(`POST ${path} failed with ${response.status()}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

test("provider reviews, curates, and atomically applies requirement quality suggestions", async ({ page }) => {
  test.slow();
  const key = Date.now();
  const email = `quality-e2e-${key}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill("Quality Owner");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  let verificationText = "";
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}&category=verification`);
    if (response.ok()) verificationText = ((await response.json()) as { text: string }).text;
    return response.status();
  }).toBe(200);
  const verificationUrl = verificationText.match(/https?:\/\/\S+/u)?.[0];
  if (!verificationUrl) throw new Error("Verification URL was not available.");
  await page.goto(verificationUrl);
  await page.getByRole("button", { name: "Verify email" }).click();
  await page.getByRole("link", { name: "Continue to ClientScope" }).click();

  const workspace = await mutate<{ workspace: { id: string } }>(page, "/workspaces", { name: `Quality Studio ${key}` });
  const client = await mutate<{ client: { id: string } }>(page, `/workspaces/${workspace.workspace.id}/clients`, { name: "Quality Client" });
  await mutate(page, `/workspaces/${workspace.workspace.id}/projects`, { clientId: client.client.id, name: "Quality Project" });
  await page.goto("/");
  await page.getByRole("button", { name: /Quality Project/u }).click();
  await page.getByRole("button", { name: "Scope", exact: true }).click();
  await page.getByRole("button", { name: "Start scope draft" }).click();
  await page.getByRole("button", { name: "Add requirement" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Homepage");
  await page.getByRole("textbox", { name: "Description" }).fill("Provide the public homepage quickly.");
  await page.getByRole("textbox", { name: "Criterion 1" }).fill("Visitors can open the homepage.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole("button", { name: "Review saved draft" }).click();
  const disclosure = page.getByRole("dialog", { name: "Send this saved draft for AI quality review?" });
  await expect(disclosure).toContainText("Only ordered group labels and requirement IDs");
  await disclosure.getByRole("button", { name: "Generate private review" }).click();
  await expect(page.getByRole("heading", { name: "Review quality findings" })).toBeFocused();
  await expect(page.getByText("What measurable response target should be used?")).toBeVisible();
  await expect(page.getByText("Clarification questions · not applyable")).toBeVisible();
  await page.getByRole("textbox", { name: "Proposed text" }).fill("Reviewed homepage requirement");
  await expect(page.getByRole("button", { name: "Apply 1 selected" })).toBeDisabled();
  await page.getByRole("button", { name: "Save staging" }).click();
  await expect(page.getByText("Staging changes saved.")).toBeVisible();
  await page.getByRole("button", { name: "Apply 1 selected" }).click();
  const apply = page.getByRole("dialog", { name: "Apply 1 quality suggestions?" });
  await expect(apply).toContainText("applied atomically");
  await apply.getByRole("button", { name: "Apply selected changes" }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Reviewed homepage requirement");
  await expect(page.getByText("Applied quality reviews")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
