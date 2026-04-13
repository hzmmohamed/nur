import { test, expect } from "@playwright/test"
import fs from "fs"
import { resetAppState, completeOnboarding, createProject, createTestFrameDir, importFrames } from "./helpers"

test.describe("Frame import and timeline", () => {
  let testDir: string

  test.beforeAll(() => {
    testDir = createTestFrameDir(3)
  })

  test.afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await completeOnboarding(page)
    await createProject(page, "Frame Test")
  })

  test("shows drop zone when no frames imported", async ({ page }) => {
    await expect(page.getByText("Drop image files here or click to browse")).toBeVisible()
  })

  test("imports frames via file picker", async ({ page }) => {
    await importFrames(page, testDir)
    await expect(page.getByText("3 frames")).toBeVisible({ timeout: 15000 })
  })

  test("shows frame indicator after import", async ({ page }) => {
    await importFrames(page, testDir)
    // Timeline shows "Frame N / total" counter (target the semibold stats display, not the button title)
    await expect(page.getByText(/Frame \d+ \/ \d+/).first()).toBeVisible()
  })
})
