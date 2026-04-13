import { test, expect } from "@playwright/test"
import fs from "fs"
import { resetAppState, completeOnboarding, createProject, createTestFrameDir, importFrames } from "./helpers"

test.describe("Timeline", () => {
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
    await createProject(page, "Timeline Test")
    await importFrames(page, testDir)
    await expect(page.getByText(/Frame 1 \/ 3/).first()).toBeVisible()
  })

  test("ArrowRight advances to next frame", async ({ page }) => {
    await page.keyboard.press("ArrowRight")
    await expect(page.getByText(/Frame 2 \/ 3/).first()).toBeVisible()
  })

  test("ArrowLeft at first frame does nothing", async ({ page }) => {
    await page.keyboard.press("ArrowLeft")
    await expect(page.getByText(/Frame 1 \/ 3/).first()).toBeVisible()
  })

  test("ArrowRight then ArrowLeft returns to frame 1", async ({ page }) => {
    await page.keyboard.press("ArrowRight")
    await expect(page.getByText(/Frame 2 \/ 3/).first()).toBeVisible()
    await page.keyboard.press("ArrowLeft")
    await expect(page.getByText(/Frame 1 \/ 3/).first()).toBeVisible()
  })

  test("time/frame toggle switches display format", async ({ page }) => {
    // Default is frame mode — toggle to time
    await page.getByRole("button", { name: "Show timecodes" }).click()
    // Now shows timecode like "0.00s / 0.12s"
    await expect(page.getByText(/\d+\.\d+s \/ \d+\.\d+s/).first()).toBeVisible()
    // Toggle back to frames
    await page.getByRole("button", { name: "Show frame numbers" }).click()
    await expect(page.getByText(/Frame 1 \/ 3/).first()).toBeVisible()
  })

  test("timeline zoom slider updates zoom percentage", async ({ page }) => {
    await expect(page.getByText("100%")).toBeVisible()
    const slider = page.getByRole("slider", { name: "Timeline zoom" })
    // Use fill to trigger React's synthetic onChange
    await slider.fill("2")
    await expect(page.getByText("200%")).toBeVisible()
  })
})
