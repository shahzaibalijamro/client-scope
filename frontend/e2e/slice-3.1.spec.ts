import { expect, type Browser, type Page, test } from "@playwright/test";

const password = "correct horse battery staple"; const origin = "http://127.0.0.1:4200";
async function account(browser: Browser, email: string, displayName: string) {
  const context = await browser.newContext({ acceptDownloads: true }); const page = await context.newPage(); await page.goto("/sign-up");
  await page.getByLabel("Display name").fill(displayName); await page.getByLabel("Email address").fill(email); await page.getByLabel("Password").fill(password); await page.getByRole("button", { name: "Create account" }).click();
  let text = ""; await expect.poll(async () => { const response = await page.request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}&category=verification`); if (response.ok()) text = ((await response.json()) as { text: string }).text; return response.status(); }).toBe(200);
  const link = text.match(/https?:\/\/\S+/u)?.[0]; if (!link) throw new Error("Verification link missing"); await page.goto(link); await page.getByRole("button", { name: "Verify email" }).click(); await page.getByRole("link", { name: "Continue to ClientScope" }).click(); return { context, page };
}
async function mutate<T>(page: Page, path: string, data: unknown): Promise<T> {
  const csrf = await (await page.request.get("/api/v1/csrf")).json() as { csrfToken: string }; const response = await page.request.post(`/api/v1${path}`, { data, headers: { Origin: origin, "X-CSRF-Token": csrf.csrfToken } });
  if (!response.ok()) throw new Error(`POST ${path} failed: ${response.status()} ${await response.text()}`); return response.json() as Promise<T>;
}

test("an authorized member downloads the shared record while another account receives safe cross-project denial", async ({ browser }) => {
  const key = Date.now(); const owner = await account(browser, `export-e2e-owner-${key}@example.com`, "Export Owner"); const outsider = await account(browser, `export-e2e-outsider-${key}@example.com`, "Outsider");
  const workspace = await mutate<{ workspace: { id: string } }>(owner.page, "/workspaces", { name: `Export Studio ${key}` }); const client = await mutate<{ client: { id: string } }>(owner.page, `/workspaces/${workspace.workspace.id}/clients`, { name: "Export Client" }); const projectName = `Export Project ${key}`; const project = await mutate<{ project: { id: string } }>(owner.page, `/workspaces/${workspace.workspace.id}/projects`, { clientId: client.client.id, name: projectName });
  await owner.page.goto("/"); await owner.page.getByRole("button", { name: new RegExp(projectName) }).click(); await owner.page.getByRole("button", { name: "Settings", exact: true }).click(); await expect(owner.page.getByRole("heading", { name: "Project export" })).toBeVisible();
  const downloadEvent = owner.page.waitForEvent("download"); await owner.page.getByRole("button", { name: "Export project record" }).click(); const download = await downloadEvent; expect(download.suggestedFilename()).toMatch(/Export Project.*project-record.*\.zip/u); await expect(owner.page.getByRole("status")).toContainText("downloaded");
  const denied = await outsider.page.request.get(`/api/v1/projects/${project.project.id}/export`); expect(denied.status()).toBe(404); expect((await denied.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  await Promise.all([owner.context.close(), outsider.context.close()]);
});
