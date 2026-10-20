import { expect, test, type Page } from "@playwright/test";

const password = process.env.SEED_USER_PASSWORD!;

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("a signed-out visit is sent to sign-in; a wrong password is rejected", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByPlaceholder("Email").fill("ada@acme.test");
  await page.getByPlaceholder("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});

test("Ada (Acme admin) creates and renames a project, and cannot open Globex", async ({ page }) => {
  await signIn(page, "ada@acme.test");
  await expect(page).toHaveURL(/\/t\/acme\/projects$/);
  await expect(page.getByRole("heading", { name: "Acme Corp" })).toBeVisible();
  await expect(page.getByText("Acme Website Revamp")).toBeVisible();

  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Name is required")).toBeVisible();

  await page.getByPlaceholder("Project name").fill("E2E Project");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("E2E Project", { exact: true })).toBeVisible();

  await page.getByPlaceholder("Project name").fill("e2e project");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("A project with this name already exists")).toBeVisible();

  await page.getByRole("button", { name: "Rename E2E Project" }).click();
  await page.getByLabel("Rename E2E Project").fill("E2E Project Renamed");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("E2E Project Renamed")).toBeVisible();

  // Same session (Better Auth rate-limits sign-in to 3 per 10 s): Globex is off limits.
  await page.goto("/t/globex/projects");
  await expect(page.getByRole("heading", { name: "Organization not found" })).toBeVisible();
  await expect(page.getByText("Globex Data Migration")).toHaveCount(0);
  const api = await page.request.get("/api/tenants/globex/projects");
  expect(api.status()).toBe(404);
});

test("Vic (viewer) sees no write controls, and a forced write is 403", async ({ page }) => {
  await signIn(page, "vic@acme.test");
  await expect(page).toHaveURL(/\/t\/acme\/projects$/);
  await expect(page.getByText("You have read-only access to this organization.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Rename/ })).toHaveCount(0);
  const write = await page.request.post("/api/tenants/acme/projects", { data: { name: "Viewer write" } });
  expect(write.status()).toBe(403);
  await page.reload();
  await expect(page.getByText("Viewer write")).toHaveCount(0);
});
