import { expect, test } from "@playwright/test";

test("home links to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TenantDesk" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
