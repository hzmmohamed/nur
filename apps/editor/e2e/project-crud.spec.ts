import { test, expect } from "@playwright/test"

test.describe("Project management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    // Clear IndexedDB for clean state
    await page.evaluate(() => {
      const dbs = ["nur-project-index"]
      dbs.forEach((name) => indexedDB.deleteDatabase(name))
    })
    await page.reload()
    await page.waitForLoadState("networkidle")
  })

  test("shows empty state on first load", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText(/no projects/i)).toBeVisible()
  })

  test("creates a project and navigates to editor", async ({ page }) => {
    await page.goto("/")
    await page.getByPlaceholder(/new project/i).fill("Test Animation")
    await page.getByRole("button", { name: /create/i }).click()
    await expect(page).toHaveURL(/\/project\//)
    await expect(page.getByText("Test Animation")).toBeVisible()
  })

  test("creates a project with Enter key", async ({ page }) => {
    await page.goto("/")
    await page.getByPlaceholder(/new project/i).fill("Enter Project")
    await page.getByPlaceholder(/new project/i).press("Enter")
    await expect(page).toHaveURL(/\/project\//)
  })

  test("project persists after page reload", async ({ page }) => {
    await page.goto("/")
    await page.getByPlaceholder(/new project/i).fill("Persistent Project")
    await page.getByRole("button", { name: /create/i }).click()

    // Navigate back to list
    await page.getByRole("button", { name: /back/i }).or(page.getByText(/back/i)).click()
    await expect(page.getByText("Persistent Project")).toBeVisible()

    // Reload
    await page.reload()
    await page.waitForLoadState("networkidle")
    await expect(page.getByText("Persistent Project")).toBeVisible()
  })

  test("deletes a project", async ({ page }) => {
    await page.goto("/")
    await page.getByPlaceholder(/new project/i).fill("Delete Me")
    await page.getByRole("button", { name: /create/i }).click()
    await page.getByRole("button", { name: /back/i }).or(page.getByText(/back/i)).click()
    await expect(page.getByText("Delete Me")).toBeVisible()

    await page.getByRole("button", { name: /delete/i }).click()
    await expect(page.getByText("Delete Me")).not.toBeVisible()
  })
})
