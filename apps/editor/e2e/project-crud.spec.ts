import { test, expect } from "@playwright/test"
import { resetAppState, completeOnboarding } from "./helpers"

test.describe("Project management", () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await completeOnboarding(page)
  })

  test("shows empty state on first load", async ({ page }) => {
    await expect(page.getByText("No projects yet")).toBeVisible()
  })

  test("creates a project and navigates to editor", async ({ page }) => {
    await page.getByPlaceholder("New project name...").fill("Test Animation")
    await page.getByRole("button", { name: "+ New Project" }).click()
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
    await page.getByRole("button", { name: "+ New Project" }).click()
    await expect(page).toHaveURL(/\/project\//)

    // Navigate back home via the home icon button
    await page.getByTitle("Home").click()
    await expect(page.getByText("Persistent Project")).toBeVisible({ timeout: 10000 })

    // Ensure IndexedDB has time to flush writes before reload
    await page.waitForTimeout(500)
    await page.reload()
    await expect(page.getByText("Persistent Project")).toBeVisible({ timeout: 10000 })
  })

  test("deletes a project", async ({ page }) => {
    const projectName = "Delete Me"
    await page.getByPlaceholder("New project name...").fill(projectName)
    await page.getByRole("button", { name: "+ New Project" }).click()
    await expect(page).toHaveURL(/\/project\//)

    // Navigate back home
    await page.getByTitle("Home").click()
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 })

    // Delete via icon button (aria-label includes project name)
    await page.getByRole("button", { name: `Delete project ${projectName}` }).click()
    await expect(page.getByText(projectName)).not.toBeVisible()
    await expect(page.getByText("No projects yet")).toBeVisible()
  })
})
