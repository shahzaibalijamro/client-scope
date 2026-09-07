import { expect, type Browser, type BrowserContext, type Page, test } from "@playwright/test";

const password = "correct horse battery staple";

async function emailLink(page: Page, email: string, category: "verification" | "invitation") {
  await expect.poll(async () => {
    const result = await page.request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}&category=${category}`);
    return result.status();
  }).toBe(200);
  const result = await page.request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}&category=${category}`);
  const body = await result.json() as { text: string };
  return body.text;
}

async function signupAndVerify(page: Page, email: string, displayName: string, startUrl = "/") {
  await page.goto(startUrl);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await page.goto(await emailLink(page, email, "verification"));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("Email verified.")).toBeVisible();
  await page.getByRole("link", { name: "Continue to ClientScope" }).click();
}

async function createOwner(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signupAndVerify(page, email, "Workspace Owner");
  await expect(page.getByRole("heading", { name: /Good to see you/u })).toBeVisible();
  return { context, page };
}

async function createWorkspaceClientProject(page: Page, suffix: string) {
  await page.getByRole("button", { name: /New workspace/u }).click();
  await page.getByLabel("Workspace name").fill(`Studio ${suffix}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: `Studio ${suffix}` })).toBeVisible();
  await page.getByRole("button", { name: "Manage workspace" }).click();
  await page.getByLabel("Client name").fill(`Client ${suffix}`);
  await page.getByLabel("Company").fill(`Company ${suffix}`);
  await page.getByLabel("Contact email").fill(`contact-${suffix.toLowerCase()}@example.com`);
  await page.getByLabel("Internal notes").fill(`private ${suffix}`);
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByText(`Company ${suffix}`, { exact: false })).toBeVisible();
  await page.getByLabel("Project name").fill(`Project ${suffix}`);
  await page.locator('select[name="clientId"]').selectOption({ label: `Client ${suffix}` });
  await page.getByLabel("Description").fill(`Description ${suffix}`);
  await page.getByLabel("Target deadline").fill("2020-02-29");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: "Your work" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Project ${suffix}`) })).toBeVisible();
  await page.getByRole("button", { name: "Manage workspace" }).click();
}

async function createAdditionalClientProject(page: Page, suffix: string) {
  await page.getByLabel("Client name").fill(`Other Client ${suffix}`);
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.locator(".client-record").getByText(`Other Client ${suffix}`, { exact: true })).toBeVisible();
  await page.getByLabel("Project name").fill(`Other Project ${suffix}`);
  await page.locator('select[name="clientId"]').selectOption({ label: `Other Client ${suffix}` });
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: "Your work" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Other Project ${suffix}`) })).toBeVisible();
  await page.getByRole("button", { name: "Manage workspace" }).click();
}

async function issueInvite(page: Page, email: string, kind: "workspace" | "project", projectName?: string, role: "client-participant" | "client-approver" = "client-participant") {
  await page.getByRole("button", { name: "Access" }).click();
  const panel = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "Invite someone" }) });
  await panel.getByLabel("Email").fill(email);
  if (kind === "project") {
    await panel.getByLabel("Access type").selectOption("project");
    await panel.locator('select[name="projectId"]').selectOption({ label: projectName });
    await panel.getByLabel("Client role").selectOption(role);
  }
  await panel.getByRole("button", { name: "Issue invitation" }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByText(/pending · delivery sent/u)).toBeVisible();
}

async function acceptInvite(browser: Browser, ownerPage: Page, email: string, displayName: string, mobile = false) {
  const link = await emailLink(ownerPage, email, "invitation");
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 } } : undefined);
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Use the invited account" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in or create an account" }).click();
  await signupAndVerify(page, email, displayName, page.url());
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("heading", { name: /Good to see you/u })).toBeVisible();
  return { context, page };
}

test("provider setup and client approver acceptance", async ({ browser }) => {
  const key = Date.now();
  const owner = await createOwner(browser, `owner-${key}@example.com`);
  await createWorkspaceClientProject(owner.page, `A${key}`);
  await createAdditionalClientProject(owner.page, `A${key}`);
  const clientEmail = `approver-${key}@example.com`;
  await issueInvite(owner.page, clientEmail, "project", `Project A${key}`, "client-approver");
  const client = await acceptInvite(browser, owner.page, clientEmail, "Client Approver", true);

  await expect(client.page.getByRole("heading", { name: `Studio A${key}` })).toBeVisible();
  await expect(client.page.getByText("client approver", { exact: true })).toBeVisible();
  await expect(client.page.getByText(`private A${key}`)).not.toBeVisible();
  await expect(client.page.getByText(`Company A${key}`)).not.toBeVisible();
  await expect(client.page.getByText(`Other Project A${key}`)).not.toBeVisible();
  await client.page.getByRole("button", { name: new RegExp(`Project A${key}`) }).click();
  await expect(client.page.getByText(`Description A${key}`)).toBeVisible();
  await expect(client.page.getByText("workspace owner", { exact: true })).toBeVisible();

  await client.context.close();
  await owner.context.close();
});

test("service assignment is project-scoped and revocation is immediate", async ({ browser }) => {
  const key = Date.now();
  const owner = await createOwner(browser, `owner-service-${key}@example.com`);
  await createWorkspaceClientProject(owner.page, `S${key}`);
  await createAdditionalClientProject(owner.page, `S${key}`);
  const memberEmail = `member-${key}@example.com`;
  await issueInvite(owner.page, memberEmail, "workspace");
  const member = await acceptInvite(browser, owner.page, memberEmail, "Team Member");
  await expect(member.page.getByText("No accessible projects yet.")).toBeVisible();

  await owner.page.reload();
  await owner.page.getByRole("button", { name: "Manage workspace" }).click();
  await owner.page.getByRole("button", { name: "Access" }).click();
  const assignmentPanel = owner.page.locator("section.panel").filter({ has: owner.page.getByRole("heading", { name: "Assign a service-team member" }) });
  await assignmentPanel.getByLabel("Member").selectOption({ label: "Team Member" });
  await assignmentPanel.locator('select[name="projectId"]').selectOption({ label: `Project S${key}` });
  await assignmentPanel.getByRole("button", { name: "Assign project" }).click();
  await member.page.reload();
  await expect(member.page.getByRole("button", { name: new RegExp(`Project S${key}`) })).toBeVisible();
  await expect(member.page.getByText(`Other Project S${key}`)).not.toBeVisible();
  await member.page.getByRole("button", { name: new RegExp(`Project S${key}`) }).click();
  await expect(member.page.getByText(`Company S${key}`, { exact: false })).toBeVisible();
  await expect(member.page.getByText(`private S${key}`)).not.toBeVisible();
  await member.page.getByRole("button", { name: /Your work/u }).click();

  await owner.page.getByRole("button", { name: "Unassign" }).click();
  await owner.page.getByRole("button", { name: "Unassign project" }).click();
  await member.page.reload();
  await expect(member.page.getByText("No accessible projects yet.")).toBeVisible();

  await assignmentPanel.getByLabel("Member").selectOption({ label: "Team Member" });
  await assignmentPanel.locator('select[name="projectId"]').selectOption({ label: `Project S${key}` });
  await assignmentPanel.getByRole("button", { name: "Assign project" }).click();
  await owner.page.getByRole("button", { name: "Remove", exact: true }).click();
  await owner.page.getByRole("button", { name: "Remove member" }).click();
  await expect(owner.page.getByText(/inactive · workspace-removed/u)).toBeVisible();
  await member.page.reload();
  await expect(member.page.getByText("Your client work will live here")).toBeVisible();

  await member.context.close();
  await owner.context.close();
});

test("invitation privacy, role authority change, and voluntary leave", async ({ browser }) => {
  const key = Date.now();
  const owner = await createOwner(browser, `owner-role-${key}@example.com`);
  await createWorkspaceClientProject(owner.page, `R${key}`);
  const clientEmail = `participant-${key}@example.com`;
  await issueInvite(owner.page, clientEmail, "project", `Project R${key}`);
  const link = await emailLink(owner.page, clientEmail, "invitation");

  const signedOutContext: BrowserContext = await browser.newContext();
  const signedOutPage = await signedOutContext.newPage();
  await signedOutPage.goto(link);
  await expect(signedOutPage.getByRole("heading", { name: "Use the invited account" })).toBeVisible();
  await expect(signedOutPage.getByText(`Project R${key}`)).not.toBeVisible();
  await signedOutContext.close();

  await owner.page.goto(link);
  await expect(owner.page.getByRole("heading", { name: "Use the invited account" })).toBeVisible();
  await expect(owner.page.getByText(`Project R${key}`)).not.toBeVisible();

  const client = await acceptInvite(browser, owner.page, clientEmail, "Client Participant");
  await expect(client.page.getByText("client participant", { exact: true })).toBeVisible();
  await owner.page.goto("/");
  await owner.page.getByRole("button", { name: "Manage workspace" }).click();
  await owner.page.getByRole("button", { name: "Access" }).click();
  await owner.page.getByRole("button", { name: "Change role" }).click();
  await owner.page.getByRole("button", { name: "Make approver" }).click();
  await expect(owner.page.getByText(/client participant · inactive · role-changed/u)).toBeVisible();

  await client.page.reload();
  await expect(client.page.getByText("client approver", { exact: true })).toBeVisible();
  await client.page.getByRole("button", { name: new RegExp(`Project R${key}`) }).click();
  await client.page.getByRole("button", { name: "Leave project" }).click();
  await client.page.getByRole("button", { name: "Leave project" }).last().click();
  await expect(client.page.getByText("Your client work will live here")).toBeVisible();

  await client.context.close();
  await owner.context.close();
});
