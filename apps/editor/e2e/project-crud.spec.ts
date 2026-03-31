import { test, expect } from "@playwright/test"

test.describe("Project management", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and clear all NUR databases
    await page.goto("/")
    await page.evaluate(async () => {
      // Close any open y-indexeddb connections by destroying docs
      // Then delete the databases
      const dbs = await indexedDB.databases()
      for (const db of dbs) {
        if (db.name?.startsWith("nur-")) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    })
    // Hard reload to get a fresh app state (clears module singletons)
    await page.reload()
    await page.getByText("NUR").waitFor({ timeout: 10000 })
  })

  test("shows empty state on first load", async ({ page }) => {
    await expect(page.getByText("No projects yet")).toBeVisible()
  })

  test("creates a project and navigates to editor", async ({ page }) => {
    await page.getByPlaceholder("New project name...").fill("Test Animation")
    await page.getByRole("button", { name: "Create" }).click()
    await expect(page).toHaveURL(/\/project\//)
    await expect(page.getByText("Test Animation")).toBeVisible()
  })

  test("creates a project with Enter key", async ({ page }) => {
    await page.getByPlaceholder("New project name...").fill("Enter Project")
    await page.getByPlaceholder("New project name...").press("Enter")
    await expect(page).toHaveURL(/\/project\//)
  })

  test("project persists after page reload", async ({ page }) => {
    await page.getByPlaceholder("New project name...").fill("Persistent Project")
    await page.getByRole("button", { name: "Create" }).click()

    // Navigate back and wait for project to appear in list
    await page.getByText("Back").click()
    await expect(page.getByText("Persistent Project")).toBeVisible({ timeout: 10000 })

    // Ensure IndexedDB has time to flush writes before reload
    await page.waitForTimeout(500)
    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText("Persistent Project")).toBeVisible({ timeout: 10000 })
  })

  test("deletes a project", async ({ page }) => {
    await page.getByPlaceholder("New project name...").fill("Delete Me")
    await page.getByRole("button", { name: "Create" }).click()

    // Navigate back and wait for project to appear
    await page.getByText("Back").click()
    await expect(page.getByText("Delete Me")).toBeVisible({ timeout: 10000 })

    // Delete
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(page.getByText("Delete Me")).not.toBeVisible()
    await expect(page.getByText("No projects yet")).toBeVisible()
  })
})
