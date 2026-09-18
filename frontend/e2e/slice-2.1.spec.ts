import { expect, test } from "@playwright/test";

const password = "correct horse battery staple";
const origin = "http://127.0.0.1:4200";

async function mutate<T>(page: import("@playwright/test").Page, path: string, data: unknown): Promise<T> {
  const csrf = await (await page.request.get("/api/v1/csrf")).json() as { csrfToken: string };
  const response = await page.request.post(`/api/v1${path}`, { data, headers: { Origin: origin, "X-CSRF-Token": csrf.csrfToken } });
  if (!response.ok()) throw new Error(`POST ${path} failed with ${response.status()}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

test("provider reviews and explicitly appends an AI-structured requirement", async ({ page }) => {
  test.slow();
  const key = Date.now();
  const email = `ai-e2e-${key}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill("AI Owner");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
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

  const workspace = await mutate<{ workspace: { id: string } }>(page, "/workspaces", { name: `AI Studio ${key}` });
  const client = await mutate<{ client: { id: string } }>(page, `/workspaces/${workspace.workspace.id}/clients`, { name: "AI Client" });
  await mutate(page, `/workspaces/${workspace.workspace.id}/projects`, { clientId: client.client.id, name: "AI Project" });
  await page.goto("/");
  await page.getByRole("button", { name: /AI Project/u }).click();
  await page.getByRole("button", { name: "Scope", exact: true }).click();
  await page.getByRole("button", { name: "Start scope draft" }).click();
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(page.getByRole("heading", { name: "Structure notes with AI" })).toBeVisible();
  await page.getByRole("textbox", { name: "Messy requirement notes" }).fill("Visitors need a contact page. The delivery date is undecided.");
  await page.getByRole("button", { name: "Generate private proposal" }).click();
  await expect(page.getByRole("heading", { name: "Review before adding to the draft" })).toBeFocused();
  await expect(page.getByText("The source does not state a delivery date.")).toBeVisible();
  await page.getByRole("textbox", { name: "Title" }).fill("Reviewed contact page");
  await expect(page.getByRole("button", { name: "Apply 1 selected" })).toBeDisabled();
  await page.getByRole("button", { name: "Save staging" }).click();
  await expect(page.getByText("Staging changes saved.")).toBeVisible();
  await page.getByRole("button", { name: "Apply 1 selected" }).click();
  const dialog = page.getByRole("dialog", { name: "Append selected requirements?" });
  await expect(dialog).toContainText("Existing groups and requirements will not be changed");
  await dialog.getByRole("button", { name: "Append to draft" }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Reviewed contact page");
  await expect(page.getByText("Applied AI imports")).toBeVisible();
  await expect(page.getByText("Not yet in scope")).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
