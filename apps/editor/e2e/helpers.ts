import type { Page } from "@playwright/test"
import path from "path"
import fs from "fs"
import os from "os"

/** Clear all nur-* localStorage keys and wait for all nur-* IndexedDB deletions. */
export async function resetAppState(page: Page) {
  await page.goto("/")
  await page.evaluate(async () => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("nur-")) localStorage.removeItem(key)
    }
    const dbs = await indexedDB.databases()
    await Promise.all(
      dbs
        .filter((db) => db.name?.startsWith("nur-"))
        .map(
          (db) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(db.name!)
              req.onsuccess = () => resolve()
              req.onerror = () => resolve()
              req.onblocked = () => resolve()
            })
        )
    )
  })
  await page.reload()
}

/** Complete onboarding if present, then wait for the project list header. */
export async function completeOnboarding(page: Page) {
  const nameInput = page.getByPlaceholder("Your name...")
  const nurHeader = page.getByText("NUR")
  await Promise.race([
    nameInput.waitFor({ timeout: 10000 }),
    nurHeader.waitFor({ timeout: 10000 }),
  ])
  if (await nameInput.isVisible()) {
    await nameInput.fill("Tester")
    await page.getByRole("button", { name: "Get Started" }).click()
  }
  await page.getByText("NUR").waitFor({ timeout: 10000 })
}

/** Create a project by name and navigate into the editor. */
export async function createProject(page: Page, name = "Test Project") {
  await page.getByPlaceholder("New project name...").fill(name)
  await page.getByRole("button", { name: "+ New Project" }).click()
  await page.waitForURL(/\/project\//)
}

// Create a minimal valid 1x1 PNG
function createTestPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  )
}

/** Create N test PNG files in a temp dir. Returns the dir path. */
export function createTestFrameDir(count = 3): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nur-test-frames-"))
  for (let i = 1; i <= count; i++) {
    fs.writeFileSync(path.join(dir, `frame${i}.png`), createTestPng())
  }
  return dir
}

/** Import frames into the currently open project via the file picker. */
export async function importFrames(page: Page, frameDir: string, count = 3) {
  const files = Array.from({ length: count }, (_, i) =>
    path.join(frameDir, `frame${i + 1}.png`)
  )
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByText("Drop image files here or click to browse").click(),
  ])
  await fileChooser.setFiles(files)
  await page.getByText(`${count} frames`).waitFor({ timeout: 15000 })
}
