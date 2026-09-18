import { expect, test } from "@playwright/test";

test("critical navigation: public homepage, responsive media fallback, keyboard and metadata", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clear work.Clear decisions.");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Explore demo", exact: true }).first()).toHaveAttribute("href", "/sign-in?intent=demo");
    await page.locator("#product").scrollIntoViewIfNeeded();
    await expect(page.getByAltText(/Approved ClientScope scope version/u)).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("heading", { name: /Make the next decision\s*a clear one/u })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://127.0.0.1:4200");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "http://127.0.0.1:4200/social-card");
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  for (const link of await page.getByRole("link", { name: /View source/u }).all()) {
    await expect(link).toHaveAttribute("href", "https://github.com/shahzaibalijamro/client-scope");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});

test("critical navigation: public entry routes preserve history and ignore redirect queries", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore demo", exact: true }).first().click();
  await expect(page).toHaveURL(/\/sign-in\?intent=demo$/u);
  await expect(page.getByRole("status")).toContainText("disabled");
  await expect(page.getByRole("heading", { name: "Sign in to your work" })).toBeVisible();
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up$/u);
  await page.reload();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/sign-in\?intent=demo$/u);
  await page.goForward();
  await expect(page).toHaveURL(/\/sign-up$/u);
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/u);
  await expect(page.getByRole("heading", { name: "Request a reset link" })).toBeVisible();
  await page.goto("/sign-in?intent=demo&intent=demo&returnTo=https://evil.example");
  await expect(page.getByRole("heading", { name: "Sign in to your work" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Explore the shared demo" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("evil.example");
});

test("critical navigation: public metadata and assets are available without JavaScript or trusted request headers", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4200/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /freelancers/u);
  const card = await request.get("/social-card");
  expect(card.ok()).toBe(true);
  expect(card.headers()["content-type"]).toContain("image/png");
  const bytes = await card.body();
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
  const response = await request.get("/", { headers: { "X-Forwarded-Host": "evil.example", Forwarded: "host=evil.example;proto=http" } });
  const html = await response.text();
  expect(html).toContain('href="http://127.0.0.1:4200/"');
  expect(html).not.toMatch(/evil\.example|owner-unique-demo-secret|approver-unique-demo-secret|token=/u);
  expect((await request.get("/icon.svg")).ok()).toBe(true);
  await page.goto("http://127.0.0.1:4200/verify?token=secret-not-for-metadata");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://127.0.0.1:4200/verify");
  await expect(page.locator('meta[property="og:url"]')).not.toHaveAttribute("content", /secret/u);
  await context.close();
});

test("critical navigation: missing public pages provide branded safe recovery", async ({ page }) => {
  await page.goto("/missing-page?message=%3Cscript%3Eprivate%3C/script%3E");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("private");
  await page.getByRole("link", { name: "Back to ClientScope" }).click();
  await expect(page).toHaveURL("/");
});

test("critical navigation: signup, verification, authenticated entry redirects, and safe project resumption", async ({ page }, info) => {
  const email = `launch-${info.project.name}-${Date.now()}@example.com`;
  const password = "correct horse battery staple";
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill("Launch Visitor");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  const message = await (await page.request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}&category=verification`)).json() as { text: string; html: string };
  const verificationUrl = message.text.match(/https?:\/\/\S+/u)?.[0];
  expect(verificationUrl).toBeDefined();
  await page.goto(verificationUrl!);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await page.getByRole("link", { name: "Continue to ClientScope" }).click();
  await expect(page).toHaveURL(/\/work$/u);
  for (const path of ["/", "/sign-in", "/sign-up", "/forgot-password"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/work$/u);
    await expect(page.getByRole("heading", { name: "Good to see you, Launch." })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/u);
  const destination = "/projects/64b000000000000000000999/scope";
  await page.goto(destination);
  await expect(page).toHaveURL(/\/sign-in$/u);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole("heading", { name: "Project unavailable" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Northstar");
});
