import { test, expect } from "@playwright/test"
import fs from "fs"
import { resetAppState, completeOnboarding, createProject, createTestFrameDir, importFrames } from "./helpers"

test.describe("Left panel states", () => {
  let testDir: string

  test.beforeAll(() => {
    testDir = createTestFrameDir(3)
  })

  test.afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  test("shows 'Import frames to get started' on fresh project", async ({ page }) => {
    await resetAppState(page)
    await completeOnboarding(page)
    await createProject(page, "Panel Test")
    await expect(page.getByText("Import frames to get started")).toBeVisible()
  })

  test("shows 'Add layers' message after importing frames with no layers", async ({ page }) => {
    await resetAppState(page)
    await completeOnboarding(page)
    await createProject(page, "Panel Test")
    await importFrames(page, testDir)
    await expect(
      page.getByText("Add layers in the timeline to start masking")
    ).toBeVisible()
  })

  test("shows 'Masks on this frame' after adding a layer", async ({ page }) => {
    await resetAppState(page)
    await completeOnboarding(page)
    await createProject(page, "Panel Test")
    await importFrames(page, testDir)
    await page.getByRole("button", { name: "Add layer" }).click()
    await expect(page.getByText("Masks on this frame")).toBeVisible()
  })
})
