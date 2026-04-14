# E2E Tests: Timeline, Layers, Left Panel

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three e2e spec files covering timeline frame navigation, layer lifecycle, and left panel state transitions.

**Architecture:** Extract shared setup helpers into `e2e/helpers.ts`. Each spec imports helpers to reach the required starting state (reset → onboarding → create project → import frames → optionally add a layer). Tests assert on visible DOM text and aria-labels — no canvas interaction.

**Tech Stack:** Playwright 1.58.2, system Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Run with `pnpm e2e` from `apps/editor/`.

---

## Task 1: Extract shared helpers into `e2e/helpers.ts`

**Files:**
- Create: `apps/editor/e2e/helpers.ts`
- Modify: `apps/editor/e2e/project-crud.spec.ts`
- Modify: `apps/editor/e2e/frame-import.spec.ts`

**Context:** Both existing specs duplicate the reset + onboarding logic. Extract it to avoid drift.

**Step 1: Create `e2e/helpers.ts` with shared helpers**

```typescript
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
```

**Step 2: Update `project-crud.spec.ts` to use helpers**

Replace the inline `resetAppState` and `completeOnboarding` functions with imports:

```typescript
import { test, expect } from "@playwright/test"
import { resetAppState, completeOnboarding } from "./helpers"

test.describe("Project management", () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await completeOnboarding(page)
  })
  // ... rest unchanged
})
```

**Step 3: Update `frame-import.spec.ts` to use helpers**

Replace all inline helpers with imports:

```typescript
import { test, expect } from "@playwright/test"
import { resetAppState, completeOnboarding, createProject, createTestFrameDir, importFrames } from "./helpers"

test.describe("Frame import and timeline", () => {
  let testDir: string

  test.beforeAll(() => { testDir = createTestFrameDir(3) })
  test.afterAll(() => { fs.rmSync(testDir, { recursive: true, force: true }) })

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
    await expect(page.getByText(/Frame \d+ \/ \d+/).first()).toBeVisible()
  })
})
```

Note: keep `import fs from "fs"` for the `afterAll` cleanup.

**Step 4: Run all existing tests to verify nothing broke**

```bash
cd apps/editor && pnpm e2e
```

Expected: 8 passed.

**Step 5: Commit**

```bash
git add apps/editor/e2e/helpers.ts apps/editor/e2e/project-crud.spec.ts apps/editor/e2e/frame-import.spec.ts
git commit -m "test(e2e): extract shared helpers into e2e/helpers.ts"
```

---

## Task 2: Timeline spec — frame navigation and controls

**Files:**
- Create: `apps/editor/e2e/timeline.spec.ts`

**Context:** Tests run inside an open project with 3 frames already imported. Arrow keys are bound at the `window` level in `project.$id.tsx`. The frame counter is a `<span>` in the timeline footer showing `Frame N / total`. The time/frame toggle button has `aria-label="Show frame numbers"` when in time mode and `aria-label="Show timecodes"` when in frame mode.

**Step 1: Write the spec**

```typescript
import { test, expect } from "@playwright/test"
import fs from "fs"
import { resetAppState, completeOnboarding, createProject, createTestFrameDir, importFrames } from "./helpers"

test.describe("Timeline", () => {
  let testDir: string

  test.beforeAll(() => { testDir = createTestFrameDir(3) })
  test.afterAll(() => { fs.rmSync(testDir, { recursive: true, force: true }) })

  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await completeOnboarding(page)
    await createProject(page, "Timeline Test")
    await importFrames(page, testDir)
    // Ensure we start at frame 1
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
    // Default zoom is 100%
    await expect(page.getByText("100%")).toBeVisible()
    // Drag slider to increase zoom — set value directly via JS
    const slider = page.getByRole("slider", { name: "Timeline zoom" })
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = "2"
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await expect(page.getByText("200%")).toBeVisible()
  })
})
```

**Step 2: Run the spec**

```bash
cd apps/editor && pnpm e2e -- e2e/timeline.spec.ts
```

Expected: all 5 pass. If the toggle aria-label is reversed (starts as "Show timecodes"), swap the first click target.

**Step 3: Commit**

```bash
git add apps/editor/e2e/timeline.spec.ts
git commit -m "test(e2e): add timeline frame navigation and control tests"
```

---

## Task 3: Layers spec — layer lifecycle

**Files:**
- Create: `apps/editor/e2e/layers.spec.ts`

**Context:** The layer panel lives in the left panel of the editor. It is only accessible after frames are imported. The "Add layer" button has `aria-label="Add layer"`. The "Add group" button has `aria-label="Add group"`. Layers show "No layers" when empty. The eye icon has `title="Hide"` when visible and `title="Show"` when hidden. The delete button has `aria-label="Delete ${name}"`. Double-clicking a layer name shows an inline input; pressing Enter commits the rename.

**Step 1: Write the spec**

```typescript
import { test, expect } from "@playwright/test"
import fs from "fs"
import { resetAppState, completeOnboarding, createProject, createTestFrameDir, importFrames } from "./helpers"

test.describe("Layers", () => {
  let testDir: string

  test.beforeAll(() => { testDir = createTestFrameDir(3) })
  test.afterAll(() => { fs.rmSync(testDir, { recursive: true, force: true }) })

  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await completeOnboarding(page)
    await createProject(page, "Layer Test")
    await importFrames(page, testDir)
    // The layer list shows "No layers" initially
    await expect(page.getByText("No layers")).toBeVisible()
  })

  test("Add layer button creates a new layer", async ({ page }) => {
    await page.getByRole("button", { name: "Add layer" }).click()
    // A layer row appears — "No layers" disappears
    await expect(page.getByText("No layers")).not.toBeVisible()
    // A layer with a default name appears (typically "Layer 1" or similar)
    const layerRows = page.locator('[aria-label^="Focus layer"]')
    await expect(layerRows).toHaveCount(1)
  })

  test("double-click layer name to rename it", async ({ page }) => {
    await page.getByRole("button", { name: "Add layer" }).click()
    await expect(page.getByText("No layers")).not.toBeVisible()

    // Double-click the layer name to enter edit mode
    const layerName = page.locator('[aria-label^="Focus layer"]').first()
    await layerName.dblclick()

    // An input appears
    const input = page.locator('input[type="text"]').last()
    await input.selectAll()
    await input.fill("My Layer")
    await input.press("Enter")

    // The new name is shown
    await expect(page.getByText("My Layer")).toBeVisible()
  })

  test("delete button removes the layer", async ({ page }) => {
    await page.getByRole("button", { name: "Add layer" }).click()
    await expect(page.getByText("No layers")).not.toBeVisible()

    // Get the layer name first
    const focusBtn = page.locator('[aria-label^="Focus layer"]').first()
    const layerName = (await focusBtn.getAttribute("aria-label"))!.replace("Focus layer ", "")

    await page.getByRole("button", { name: `Delete ${layerName}` }).click()
    await expect(page.getByText("No layers")).toBeVisible()
  })

  test("Add group button creates a group entry", async ({ page }) => {
    await page.getByRole("button", { name: "Add group" }).click()
    await expect(page.getByText("No layers")).not.toBeVisible()
    // A group row appears with collapse/expand button
    await expect(
      page.getByRole("button", { name: /Collapse group|Expand group/ })
    ).toBeVisible()
  })

  test("eye icon toggles layer visibility", async ({ page }) => {
    await page.getByRole("button", { name: "Add layer" }).click()
    await expect(page.getByText("No layers")).not.toBeVisible()

    // Layer is visible by default — eye button has title "Hide"
    const eyeBtn = page.getByTitle("Hide")
    await expect(eyeBtn).toBeVisible()
    await eyeBtn.click()

    // Now eye button has title "Show" and layer row is dimmed
    await expect(page.getByTitle("Show")).toBeVisible()
    await expect(page.getByTitle("Hide")).not.toBeVisible()
  })
})
```

**Step 2: Run the spec**

```bash
cd apps/editor && pnpm e2e -- e2e/layers.spec.ts
```

Expected: all 5 pass. If the "Focus layer" aria-label format differs, check `timeline-layers.tsx` line ~463 and adjust the locator.

**Step 3: Commit**

```bash
git add apps/editor/e2e/layers.spec.ts
git commit -m "test(e2e): add layer lifecycle tests"
```

---

## Task 4: Left panel spec — state transitions

**Files:**
- Create: `apps/editor/e2e/left-panel.spec.ts`

**Context:** The left panel (`canvas-left-panel.tsx`) shows three distinct states: (1) no frames → "Import frames to get started", (2) frames but no layers → "Add layers in the timeline to start masking", (3) frames + at least one layer → "Masks on this frame". Each test starts from scratch and builds up state incrementally.

**Step 1: Write the spec**

```typescript
import { test, expect } from "@playwright/test"
import fs from "fs"
import { resetAppState, completeOnboarding, createProject, createTestFrameDir, importFrames } from "./helpers"

test.describe("Left panel states", () => {
  let testDir: string

  test.beforeAll(() => { testDir = createTestFrameDir(3) })
  test.afterAll(() => { fs.rmSync(testDir, { recursive: true, force: true }) })

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
```

**Step 2: Run the spec**

```bash
cd apps/editor && pnpm e2e -- e2e/left-panel.spec.ts
```

Expected: all 3 pass.

**Step 3: Run the full suite to confirm nothing regressed**

```bash
cd apps/editor && pnpm e2e
```

Expected: 19 passed (8 existing + 5 timeline + 5 layers + 3 left-panel).

**Step 4: Commit**

```bash
git add apps/editor/e2e/left-panel.spec.ts
git commit -m "test(e2e): add left panel state transition tests"
```
