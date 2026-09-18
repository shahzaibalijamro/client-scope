import { expect, type Page, test } from "@playwright/test";

const password = "correct horse battery staple";
const origin = "http://127.0.0.1:4200";

async function mutate<T>(page: Page, method: "POST", path: string, data: unknown): Promise<T> {
  const csrf = await (await page.request.get("/api/v1/csrf")).json() as { csrfToken: string };
  const response = await page.request.fetch(`/api/v1${path}`, { method, data, headers: { Origin: origin, "X-CSRF-Token": csrf.csrfToken } });
  if (!response.ok()) throw new Error(`${path} failed with ${response.status()}`);
  return response.json() as Promise<T>;
}

async function signup(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill("Navigation Owner"); await page.getByLabel("Email address").fill(email); await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  let link = "";
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}&category=verification`);
    if (response.ok()) link = ((await response.json()) as { text: string }).text.match(/https?:\/\/\S+/u)?.[0] ?? "";
    return response.status();
  }).toBe(200);
  await page.goto(link); await page.getByRole("button", { name: "Verify email" }).click(); await page.getByRole("link", { name: "Continue to ClientScope" }).click();
}

test("critical navigation preserves URL state, sections, switcher focus, admin routes, and dirty input", async ({ page }) => {
  test.slow(); const key = Date.now(); await signup(page, `navigation-${key}@example.com`);
  const workspace = await mutate<{ workspace: { id: string } }>(page, "POST", "/workspaces", { name: `Navigation Studio ${key}` });
  const client = await mutate<{ client: { id: string } }>(page, "POST", `/workspaces/${workspace.workspace.id}/clients`, { name: "Navigation Client" });
  const alpha = await mutate<{ project: { id: string } }>(page, "POST", `/workspaces/${workspace.workspace.id}/projects`, { clientId: client.client.id, name: "Alpha Portal", targetDeadline: "2099-01-01" });
  await mutate(page, "POST", `/workspaces/${workspace.workspace.id}/projects`, { clientId: client.client.id, name: "Beta Portal" });

  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search projects" }); await search.fill("Alpha");
  await expect(page).toHaveURL(/q=Alpha/u); await page.getByLabel("Sort projects").selectOption("name"); await expect(page).toHaveURL(/sort=name/u);
  await page.reload(); await expect(search).toHaveValue("Alpha"); await page.getByRole("button", { name: /Alpha Portal/u }).first().click();
  await expect(page).toHaveURL(`/projects/${alpha.project.id}/overview`);
  for (const section of ["Scope", "Changes", "Milestones", "Deliverables", "Activity", "Settings", "Overview"] as const) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
  }

  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  const switcher = page.getByRole("dialog", { name: "Switch project" }); await switcher.getByLabel("Search accessible projects").fill("Beta"); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Beta Portal" })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(`Navigation Studio ${key}`) }).click();
  for (const section of ["Projects", "People & Access", "Invitations", "Clients"] as const) await page.getByRole("button", { name: section, exact: true }).click();
  await page.getByRole("button", { name: "Add client" }).click(); await page.getByLabel("Client name").fill("Unsaved client");
  await page.getByRole("button", { name: "Close Add a client" }).click();
  const warning = page.getByRole("dialog", { name: "Discard unsaved changes?" }); await expect(warning).toBeVisible(); await warning.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Add a client" })).toBeVisible();
  await page.getByRole("button", { name: "Close Add a client" }).click(); await page.getByRole("button", { name: "Discard changes" }).click();
  await page.getByRole("button", { name: "My Work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All accessible projects" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
