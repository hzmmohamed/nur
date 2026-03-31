import { test, expect } from "@playwright/test"
import path from "path"
import fs from "fs"
import os from "os"

// Create a minimal valid 1x1 PNG
function createTestPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  )
}

test.describe("Frame import and timeline", () => {
  let testDir: string

  test.beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "nur-test-frames-"))
    for (let i = 1; i <= 3; i++) {
      fs.writeFileSync(path.join(testDir, `frame${i}.png`), createTestPng())
    }
  })

  test.afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      for (const db of dbs) {
        if (db.name?.startsWith("nur-")) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    })
    await page.reload()
    await page.getByText("NUR").waitFor({ timeout: 10000 })

    // Create a project
    await page.getByPlaceholder("New project name...").fill("Frame Test")
    await page.getByRole("button", { name: "Create" }).click()
    await expect(page).toHaveURL(/\/project\//)
  })

  test("shows drop zone when no frames imported", async ({ page }) => {
    await expect(page.getByText("Drop image files here")).toBeVisible()
  })

  test("imports frames via file picker", async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Drop image files here").click(),
    ])

    await fileChooser.setFiles([
      path.join(testDir, "frame1.png"),
      path.join(testDir, "frame2.png"),
      path.join(testDir, "frame3.png"),
    ])

    await expect(page.getByText("3 frames")).toBeVisible({ timeout: 15000 })
  })

  test("shows frame indicator after import", async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Drop image files here").click(),
    ])

    await fileChooser.setFiles([
      path.join(testDir, "frame1.png"),
      path.join(testDir, "frame2.png"),
      path.join(testDir, "frame3.png"),
    ])

    await expect(page.getByText("3 frames")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Frame 1/)).toBeVisible()
  })
})
