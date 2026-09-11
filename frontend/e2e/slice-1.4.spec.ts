import { expect, type Browser, type Page, test } from "@playwright/test";

const password = "correct horse battery staple";
const origin = "http://127.0.0.1:4200";

async function account(browser: Browser, email: string, displayName: string, mobile = false) {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 } } : undefined);
  const page = await context.newPage(); await page.goto("/"); await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill(displayName); await page.getByLabel("Email address").fill(email); await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  let text = "";
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}&category=verification`);
    if (response.ok()) text = ((await response.json()) as { text: string }).text;
    return response.status();
  }).toBe(200);
  const link = text.match(/https?:\/\/\S+/u)?.[0]; if (!link) throw new Error("Verification link missing");
  await page.goto(link); await page.getByRole("button", { name: "Verify email" }).click(); await page.getByRole("link", { name: "Continue to ClientScope" }).click();
  return { context, page, email };
}

async function mutate<T>(page: Page, method: "POST" | "PUT", path: string, data: unknown): Promise<T> {
  const csrf = await (await page.request.get("/api/v1/csrf")).json() as { csrfToken: string };
  const response = await page.request.fetch(`/api/v1${path}`, { method, data, headers: { Origin: origin, "X-CSRF-Token": csrf.csrfToken } });
  if (!response.ok()) throw new Error(`${method} ${path} failed with ${response.status()}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function openProject(page: Page, name: string) {
  await page.goto("/"); await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name: "Client-facing milestones" })).toBeVisible();
}

test("providers share, reorder, reopen, and archive milestones while clients remain read-only", async ({ browser }) => {
  test.slow(); const key = Date.now();
  const owner = await account(browser, `milestones-owner-${key}@example.com`, "Owner");
  const participant = await account(browser, `milestones-participant-${key}@example.com`, "Participant", true);
  const approver = await account(browser, `milestones-approver-${key}@example.com`, "Approver", true);
  const workspace = await mutate<{ workspace: { id: string } }>(owner.page, "POST", "/workspaces", { name: `Studio ${key}` });
  const client = await mutate<{ client: { id: string } }>(owner.page, "POST", `/workspaces/${workspace.workspace.id}/clients`, { name: `Client ${key}` });
  const projectName = `Project ${key}`;
  const project = await mutate<{ project: { id: string } }>(owner.page, "POST", `/workspaces/${workspace.workspace.id}/projects`, { clientId: client.client.id, name: projectName });
  for (const [target, role] of [[participant, "client-participant"], [approver, "client-approver"]] as const) {
    const invite = await mutate<{ invitation: { id: string } }>(owner.page, "POST", `/workspaces/${workspace.workspace.id}/invitations`, { kind: "project", projectId: project.project.id, email: target.email, role });
    await mutate(target.page, "POST", `/invitations/${invite.invitation.id}/accept`, {});
  }
  const draft = await mutate<{ draft: { revisionToken: string } }>(owner.page, "POST", `/projects/${project.project.id}/scope/draft`, {});
  const filled = await mutate<{ draft: { revisionToken: string } }>(owner.page, "PUT", `/projects/${project.project.id}/scope/draft`, {
    revisionToken: draft.draft.revisionToken, groups: [], requirements: [{ title: "Website", description: "Build the agreed website.", acceptanceCriteria: ["Ready for client review"], order: 0 }],
  });
  const submitted = await mutate<{ version: { id: string } }>(owner.page, "POST", `/projects/${project.project.id}/scope/submissions`, { revisionToken: filled.draft.revisionToken, confirmed: true });
  await mutate(approver.page, "POST", `/projects/${project.project.id}/scope/versions/${submitted.version.id}/decisions`, { outcome: "approved", confirmed: true });

  await openProject(owner.page, projectName);
  const create = owner.page.locator(".milestone-create");
  await create.getByLabel("Title").fill("Design review"); await create.getByLabel("Description (optional)").fill("Review the responsive design.\nCapture client-facing outcomes.");
  await create.getByLabel("Target date (optional)").fill("2020-01-01"); await create.getByRole("button", { name: "Create milestone" }).click();
  await expect(owner.page.getByRole("heading", { name: "Design review" })).toBeVisible(); await expect(owner.page.getByText("Overdue")).toBeVisible();
  await create.getByLabel("Title").fill("Launch"); await create.getByRole("button", { name: "Create milestone" }).click();
  await owner.page.getByRole("button", { name: "Move Launch up" }).press("Enter");
  await expect(owner.page.locator(".milestone-card h3").first()).toHaveText("Launch");
  const design = owner.page.locator(".milestone-card", { has: owner.page.getByRole("heading", { name: "Design review" }) });
  await design.getByRole("button", { name: "Change status" }).click(); await owner.page.getByLabel("New status").selectOption("completed");
  await owner.page.getByLabel("Transition note (optional)").fill("Reviewed with the client."); await owner.page.getByRole("button", { name: "Save status" }).click();
  await expect(design.getByText("Reviewed with the client.")).toBeVisible(); await expect(design.getByText("Overdue")).not.toBeVisible();
  await design.getByRole("button", { name: "Change status" }).click(); await owner.page.getByLabel("New status").selectOption("in-progress");
  await owner.page.getByLabel("Transition note (optional)").fill("Reopened for polish."); await owner.page.getByRole("button", { name: "Save status" }).click();
  await expect(design.getByText("Overdue")).toBeVisible();

  await openProject(participant.page, projectName); await expect(participant.page.locator(".milestone-card h3").first()).toHaveText("Launch");
  await expect(participant.page.getByRole("button", { name: "Change status" })).not.toBeVisible();
  expect(await participant.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await openProject(owner.page, projectName); const designAgain = owner.page.locator(".milestone-card", { has: owner.page.getByRole("heading", { name: "Design review" }) });
  await designAgain.getByRole("button", { name: "Archive" }).click(); await owner.page.getByLabel("Archive reason").fill("The stage is represented by launch.");
  await owner.page.getByRole("button", { name: "Archive milestone" }).click(); await expect(owner.page.getByRole("heading", { name: "Archived milestones" })).toBeVisible();
  await expect(owner.page.locator(".archived-milestone", { hasText: "Design review" })).toContainText("Reopened for polish.");
  await Promise.all([owner.context.close(), participant.context.close(), approver.context.close()]);
});
