import { test, expect } from "@playwright/test"
import fs from "fs"
import { resetAppState, completeOnboarding, createProject, createTestFrameDir, importFrames } from "./helpers"

test.describe("Layers", () => {
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
    await createProject(page, "Layer Test")
    await importFrames(page, testDir)
    await expect(page.getByText("No layers")).toBeVisible()
  })

  test("Add layer button creates a new layer", async ({ page }) => {
    await page.getByRole("button", { name: "Add layer" }).click()
    await expect(page.getByText("No layers")).not.toBeVisible()
    await expect(page.getByTestId("layer-row")).toHaveCount(1)
  })

  test("double-click layer name to rename it", async ({ page }) => {
    await page.getByRole("button", { name: "Add layer" }).click()
    await expect(page.getByText("No layers")).not.toBeVisible()

    await page.getByTestId("layer-name").first().dblclick()

    const input = page.getByTestId("layer-name-input")
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill("My Layer")
    await input.press("Enter")

    await expect(page.getByTestId("layer-name").first()).toHaveText("My Layer")
  })

  test("delete button removes the layer", async ({ page }) => {
    await page.getByRole("button", { name: "Add layer" }).click()
    await expect(page.getByText("No layers")).not.toBeVisible()

    // Hover the layer row to reveal the delete button
    await page.getByTestId("layer-row").first().hover()
    await page.locator('[aria-label^="Delete "]').first().click()
    await expect(page.getByText("No layers")).toBeVisible()
  })

  test("Add group button creates a group entry", async ({ page }) => {
    await page.getByRole("button", { name: "Add group" }).click()
    await expect(page.getByText("No layers")).not.toBeVisible()
    await expect(
      page.getByRole("button", { name: /Collapse group|Expand group/ })
    ).toBeVisible()
  })

  test("eye icon toggles layer visibility", async ({ page }) => {
    await page.getByRole("button", { name: "Add layer" }).click()
    await expect(page.getByText("No layers")).not.toBeVisible()

    const eyeBtn = page.getByTestId("layer-visibility-toggle").first()
    await expect(eyeBtn).toHaveAttribute("title", "Hide")
    await eyeBtn.click()
    await expect(eyeBtn).toHaveAttribute("title", "Show")
  })
})
