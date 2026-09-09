import { expect, type Browser, type Page, test } from "@playwright/test";

const password = "correct horse battery staple";
const origin = "http://127.0.0.1:4200";

async function emailLink(page: Page, email: string, category: "verification") {
  let text = "";
  await expect.poll(async () => {
    try {
      const response = await page.request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}&category=${category}`);
      if (response.status() === 200) text = ((await response.json()) as { text: string }).text;
      return response.status();
    } catch {
      return 0;
    }
  }).toBe(200);
  return text;
}

async function account(browser: Browser, email: string, displayName: string, mobile = false) {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 } } : undefined);
  const page = await context.newPage();
  await page.goto("/"); await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill(displayName); await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password); await page.getByRole("button", { name: "Create account" }).click();
  await page.goto(await emailLink(page, email, "verification")); await page.getByRole("button", { name: "Verify email" }).click();
  await page.getByRole("link", { name: "Continue to ClientScope" }).click();
  const session = await (await page.request.get("/api/v1/auth/session")).json() as { user: { id: string } };
  return { context, page, id: session.user.id, email };
}

async function mutate<T>(page: Page, method: "POST" | "PUT", path: string, data: unknown): Promise<T> {
  const csrf = await (await page.request.get("/api/v1/csrf")).json() as { csrfToken: string };
  const response = await page.request.fetch(`/api/v1${path}`, { method, data, headers: { Origin: origin, "X-CSRF-Token": csrf.csrfToken } });
  if (!response.ok()) throw new Error(`${method} ${path} failed with ${response.status()}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function baseProject(owner: Awaited<ReturnType<typeof account>>, suffix: string) {
  const workspace = await mutate<{ workspace: { id: string } }>(owner.page, "POST", "/workspaces", { name: `Studio ${suffix}` });
  const client = await mutate<{ client: { id: string } }>(owner.page, "POST", `/workspaces/${workspace.workspace.id}/clients`, { name: `Client ${suffix}` });
  const project = await mutate<{ project: { id: string } }>(owner.page, "POST", `/workspaces/${workspace.workspace.id}/projects`, { clientId: client.client.id, name: `Project ${suffix}` });
  return { workspaceId: workspace.workspace.id, projectId: project.project.id, projectName: `Project ${suffix}` };
}

async function grantClient(owner: Awaited<ReturnType<typeof account>>, target: Awaited<ReturnType<typeof account>>, setup: Awaited<ReturnType<typeof baseProject>>, role: "client-participant" | "client-approver") {
  const invitation = await mutate<{ invitation: { id: string } }>(owner.page, "POST", `/workspaces/${setup.workspaceId}/invitations`, { kind: "project", projectId: setup.projectId, email: target.email, role });
  await mutate(target.page, "POST", `/invitations/${invitation.invitation.id}/accept`, {});
}

async function grantService(owner: Awaited<ReturnType<typeof account>>, target: Awaited<ReturnType<typeof account>>, setup: Awaited<ReturnType<typeof baseProject>>) {
  const invitation = await mutate<{ invitation: { id: string } }>(owner.page, "POST", `/workspaces/${setup.workspaceId}/invitations`, { kind: "workspace", email: target.email, role: "service-team-member" });
  await mutate(target.page, "POST", `/invitations/${invitation.invitation.id}/accept`, {});
  await mutate(owner.page, "POST", `/projects/${setup.projectId}/assignments`, { userId: target.id });
}

async function openProject(page: Page, name: string) {
  await page.goto("/"); await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name: /Scope ·/u })).toBeVisible();
}

async function authorInitial(page: Page) {
  await page.getByRole("button", { name: "Start scope draft" }).click();
  await page.getByRole("button", { name: "Add group" }).click(); await page.getByLabel("Group 1").fill("Core");
  await page.getByRole("button", { name: "Save draft" }).click(); await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("button", { name: "Add requirement" }).click();
  let cards = page.locator(".requirement-editor");
  await cards.nth(0).getByLabel("Title").fill("Homepage"); await cards.nth(0).getByLabel("Description").fill("Build the public homepage.");
  await cards.nth(0).getByLabel("Criterion 1").fill("Works on mobile"); await cards.nth(0).getByLabel("Group").selectOption({ label: "Core" });
  await page.getByRole("button", { name: "Add requirement" }).click(); cards = page.locator(".requirement-editor");
  await cards.nth(1).getByLabel("Title").fill("Navigation"); await cards.nth(1).getByLabel("Description").fill("Provide site navigation.");
  await cards.nth(1).getByLabel("Criterion 1").fill("Every page is reachable");
  await page.getByRole("button", { name: "Save draft" }).click(); await expect(page.getByText("Draft saved.")).toBeVisible();
}

async function submit(page: Page) {
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("immutable numbered version");
  await dialog.getByRole("button", { name: "Submit scope" }).click(); await expect(page.getByRole("heading", { name: "in review" }).first()).toBeVisible();
}

test("initial requirements agreement preserves provider privacy and client authority", async ({ browser }) => {
  test.slow(); const key = Date.now();
  const owner = await account(browser, `scope-owner-${key}@example.com`, "Owner"); const setup = await baseProject(owner, `A${key}`);
  const member = await account(browser, `scope-member-${key}@example.com`, "Team Member");
  const participant = await account(browser, `scope-participant-${key}@example.com`, "Participant", true);
  const approver = await account(browser, `scope-approver-${key}@example.com`, "Approver", true);
  await grantService(owner, member, setup); await grantClient(owner, participant, setup, "client-participant"); await grantClient(owner, approver, setup, "client-approver");

  await openProject(owner.page, setup.projectName); await owner.page.getByRole("button", { name: "Start scope draft" }).click();
  await openProject(participant.page, setup.projectName); await expect(participant.page.getByRole("heading", { name: "No proposed scope yet" })).toBeVisible();
  await openProject(approver.page, setup.projectName); await expect(approver.page.getByRole("heading", { name: "No proposed scope yet" })).toBeVisible();
  await openProject(member.page, setup.projectName);
  await member.page.getByRole("button", { name: "Add group" }).click(); await member.page.getByLabel("Group 1").fill("Core");
  await member.page.getByRole("button", { name: "Save draft" }).click(); await expect(member.page.getByText("Draft saved.")).toBeVisible();
  await member.page.getByRole("button", { name: "Add requirement" }).click(); const card = member.page.locator(".requirement-editor");
  await card.getByLabel("Title").fill("Homepage"); await card.getByLabel("Description").fill("Build the homepage."); await card.getByLabel("Criterion 1").fill("Works on mobile"); await card.getByLabel("Group").selectOption({ label: "Core" });
  await member.page.getByRole("button", { name: "Save draft" }).click(); await expect(member.page.getByText("workspace owner submits", { exact: false })).toBeVisible();
  await openProject(owner.page, setup.projectName); await submit(owner.page);

  await openProject(participant.page, setup.projectName); await expect(participant.page.getByRole("heading", { name: "Homepage" })).toBeVisible();
  await expect(participant.page.getByRole("button", { name: "Approve scope" })).not.toBeVisible();
  await participant.page.getByLabel("Comment").fill("The scope is clear."); await participant.page.getByRole("button", { name: "Post comment" }).click();
  await approver.page.goto("/"); await expect(approver.page.getByText("decision required")).toBeVisible(); await openProject(approver.page, setup.projectName);
  await approver.page.getByRole("button", { name: "Approve scope" }).click(); await approver.page.getByRole("dialog").getByRole("button", { name: "Approve scope" }).click();
  await expect(approver.page.getByText("Approved by Approver")).toBeVisible(); await expect(approver.page.getByLabel("Comment")).not.toBeVisible();
  await openProject(owner.page, setup.projectName); await expect(owner.page.getByText("Approved by Approver")).toBeVisible(); await expect(owner.page.getByRole("button", { name: "Submit for review" })).not.toBeVisible();

  await Promise.all([owner.context.close(), member.context.close(), participant.context.close(), approver.context.close()]);
});

test("requested changes create a revision with identity-based comparison", async ({ browser }) => {
  test.slow(); const key = Date.now();
  const owner = await account(browser, `revision-owner-${key}@example.com`, "Owner"); const setup = await baseProject(owner, `B${key}`);
  const approver = await account(browser, `revision-approver-${key}@example.com`, "Approver"); await grantClient(owner, approver, setup, "client-approver");
  await openProject(owner.page, setup.projectName); await authorInitial(owner.page); await submit(owner.page);
  await openProject(approver.page, setup.projectName); await approver.page.getByLabel("Decision note (optional for approval)").fill("Please replace navigation with contact.");
  await approver.page.getByRole("button", { name: "Request changes" }).click(); await approver.page.getByRole("dialog").getByRole("button", { name: "Request changes" }).click();
  await expect(approver.page.getByText("Changes requested by Approver")).toBeVisible();

  await openProject(owner.page, setup.projectName); const cards = owner.page.locator(".requirement-editor"); await cards.nth(0).getByLabel("Title").fill("Homepage updated");
  await cards.nth(1).getByRole("button", { name: "Delete requirement" }).click(); await owner.page.getByRole("button", { name: "Add requirement" }).click();
  const added = owner.page.locator(".requirement-editor").nth(1); await added.getByLabel("Title").fill("Contact"); await added.getByLabel("Description").fill("Add a contact form."); await added.getByLabel("Criterion 1").fill("Messages can be sent");
  await owner.page.getByRole("button", { name: "Save draft" }).click(); await expect(owner.page.getByText("Draft saved.")).toBeVisible();
  await expect(owner.page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  await owner.page.getByLabel("Revision summary required for submission").fill("Updated homepage and replaced navigation with contact."); await submit(owner.page);
  await expect(owner.page.getByText("Added · 1")).toBeVisible(); await expect(owner.page.getByText("Removed · 1")).toBeVisible(); await expect(owner.page.getByText("Content changed · 1")).toBeVisible();
  await openProject(approver.page, setup.projectName); await approver.page.getByRole("button", { name: "Approve scope" }).click(); await approver.page.getByRole("dialog").getByRole("button", { name: "Approve scope" }).click();
  await expect(approver.page.getByText("Approved by Approver")).toBeVisible();
  await Promise.all([owner.context.close(), approver.context.close()]);
});

test("withdrawal consumes a version number and concurrent review actions have one winner", async ({ browser }) => {
  test.slow(); const key = Date.now();
  const owner = await account(browser, `withdraw-owner-${key}@example.com`, "Owner"); const setup = await baseProject(owner, `C${key}`);
  const first = await account(browser, `withdraw-first-${key}@example.com`, "First Approver"); const second = await account(browser, `withdraw-second-${key}@example.com`, "Second Approver");
  await grantClient(owner, first, setup, "client-approver"); await grantClient(owner, second, setup, "client-approver");
  const created = await mutate<{ draft: { revisionToken: string } }>(owner.page, "POST", `/projects/${setup.projectId}/scope/draft`, {});
  const saved = await mutate<{ draft: { revisionToken: string } }>(owner.page, "PUT", `/projects/${setup.projectId}/scope/draft`, { revisionToken: created.draft.revisionToken, groups: [], requirements: [{ title: "Scope", description: "Initial scope.", acceptanceCriteria: ["Complete"], order: 0 }] });
  const v1 = await mutate<{ version: { id: string } }>(owner.page, "POST", `/projects/${setup.projectId}/scope/submissions`, { revisionToken: saved.draft.revisionToken, confirmed: true });
  await mutate(first.page, "POST", `/projects/${setup.projectId}/scope/versions/${v1.version.id}/decisions`, { outcome: "changes-requested", confirmed: true, note: "Revise once." });
  let scope = await (await owner.page.request.get(`/api/v1/projects/${setup.projectId}/scope`)).json() as { scope: { draft: { revisionToken: string } } };
  const v2 = await mutate<{ version: { id: string } }>(owner.page, "POST", `/projects/${setup.projectId}/scope/submissions`, { revisionToken: scope.scope.draft.revisionToken, revisionSummary: "First revision.", confirmed: true });
  await mutate(owner.page, "POST", `/projects/${setup.projectId}/scope/versions/${v2.version.id}/withdrawal`, { confirmed: true, reason: "Provider review found an issue." });
  scope = await (await owner.page.request.get(`/api/v1/projects/${setup.projectId}/scope`)).json() as { scope: { draft: { revisionToken: string } } };
  await mutate(owner.page, "POST", `/projects/${setup.projectId}/scope/submissions`, { revisionToken: scope.scope.draft.revisionToken, revisionSummary: "Provider review complete.", confirmed: true });

  await openProject(first.page, setup.projectName); await openProject(second.page, setup.projectName); await expect(first.page.getByText("Scope v3").first()).toBeVisible();
  await first.page.getByRole("button", { name: "Approve scope" }).click(); await second.page.getByLabel("Decision note (optional for approval)").fill("One more change."); await second.page.getByRole("button", { name: "Request changes" }).click();
  await Promise.all([
    first.page.getByRole("dialog").getByRole("button", { name: "Approve scope" }).click(),
    second.page.getByRole("dialog").getByRole("button", { name: "Request changes" }).click(),
  ]);
  await Promise.all([openProject(first.page, setup.projectName), openProject(second.page, setup.projectName)]);
  const terminalCount = await first.page.getByText(/Approved by|Changes requested by/u).count(); expect(terminalCount).toBeGreaterThan(0);
  await expect(first.page.getByText("Scope v2").first()).toBeVisible(); await expect(first.page.getByText("withdrawn", { exact: true }).first()).toBeVisible();
  const other = await baseProject(owner, `Other${key}`); const denied = await first.page.request.get(`/api/v1/projects/${other.projectId}/scope`); expect(denied.status()).toBe(404);
  await Promise.all([owner.context.close(), first.context.close(), second.context.close()]);
});
