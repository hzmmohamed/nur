# Park UI Migration + Playwright E2E Testing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace raw HTML elements in the editor app with Park UI components scaffolded via the CLI, and set up Playwright e2e tests covering the core user flows built so far (project CRUD, frame import, timeline navigation).

**Architecture:** Park UI components are scaffolded into the project via `npx @park-ui/cli add <component>`. They land in a components directory and are imported as local source. Playwright runs against the Vite dev server with a `webServer` config. Tests cover the critical paths: project creation/deletion, frame import via file picker, and timeline frame navigation.

**Tech Stack:** Park UI (@park-ui/cli), Ark UI, Panda CSS, Playwright

---

### Task 1: Initialize Park UI CLI and scaffold base components

**Step 1: Initialize Park UI in the editor app**

Run from `apps/editor/`:
```bash
cd apps/editor && npx @park-ui/cli init
```

This creates the Park UI configuration and component output directory. Follow the prompts — select Panda CSS, React, and the default component path.

**Step 2: Scaffold the components we need**

```bash
cd apps/editor
npx @park-ui/cli add button
npx @park-ui/cli add input
npx @park-ui/cli add icon-button
npx @park-ui/cli add card
npx @park-ui/cli add text
npx @park-ui/cli add heading
npx @park-ui/cli add spinner
npx @park-ui/cli add link
npx @park-ui/cli add icon
```

**Step 3: Run panda codegen**

Run: `pnpm --filter @nur/editor prepare`

**Step 4: Verify typecheck**

Run: `pnpm --filter @nur/editor typecheck`

**Step 5: Commit**

```bash
git add apps/editor/
git commit -m "chore(editor): scaffold Park UI components via CLI"
```

---

### Task 2: Migrate project list page to Park UI

**Files:**
- Modify: `apps/editor/src/routes/index.tsx`

Replace raw HTML elements with Park UI components:
- `<input>` → Park UI `Input`
- `<button>` (Create) → Park UI `Button`
- `<button>` (Delete) → Park UI `IconButton` or `Button` with variant
- `<h1>` → Park UI `Heading`
- `<p>` → Park UI `Text`
- Project list items → Park UI `Card`
- Loading state → Park UI `Spinner`

The file should import components from the Park UI scaffolded directory (whatever path `@park-ui/cli init` configured — typically `~/components/ui/`).

**Key replacements:**

```tsx
// Before
<h1 className={css({ fontSize: "3xl", fontWeight: "bold", mb: "6" })}>NUR</h1>

// After
<Heading as="h1" size="3xl" mb="6">NUR</Heading>
```

```tsx
// Before
<input className={css({ flex: "1", ... })} type="text" ... />

// After
<Input flex="1" placeholder="New project name..." value={newName} onChange={...} onKeyDown={...} />
```

```tsx
// Before
<button className={css({ px: "4", ... })} onClick={handleCreate}>Create</button>

// After
<Button onClick={handleCreate}>Create</Button>
```

```tsx
// Before - loading
<p>Loading...</p>

// After
<Spinner />
```

**Step 1: Rewrite the route with Park UI components**

Update `apps/editor/src/routes/index.tsx` to use the scaffolded Park UI components. Keep all the existing logic (hooks, handlers) — only change the JSX markup.

**Step 2: Run panda codegen, typecheck**

Run: `pnpm --filter @nur/editor prepare && pnpm --filter @nur/editor typecheck`

**Step 3: Verify in browser**

Run: `pnpm --filter @nur/editor dev`
Expected: Project list looks polished with Park UI styling. All functionality works as before.

**Step 4: Commit**

```bash
git add apps/editor/
git commit -m "refactor(editor): migrate project list page to Park UI components"
```

---

### Task 3: Migrate editor page header and drop zone to Park UI

**Files:**
- Modify: `apps/editor/src/routes/project.$id.tsx`
- Modify: `apps/editor/src/components/frame-drop-zone.tsx`

**Editor header replacements:**
- `<Link>` → Park UI `Button` with `asChild` wrapping the TanStack `Link`, or Park UI `Link`
- `<h1>` → Park UI `Heading`
- `<span>` (frame count) → Park UI `Text`

**Drop zone replacements:**
- `<p>` → Park UI `Text`
- Add Park UI `Spinner` for the importing state
- The drop zone container `<div>` keeps its custom styling (drag-and-drop behavior) but uses Panda CSS `styled` patterns

**Step 1: Update editor route header**

Replace raw elements in the header section of `apps/editor/src/routes/project.$id.tsx`.

**Step 2: Update frame drop zone**

Replace `<p>` elements in `apps/editor/src/components/frame-drop-zone.tsx` with Park UI `Text`, add `Spinner` during import.

**Step 3: Run panda codegen, typecheck**

Run: `pnpm --filter @nur/editor prepare && pnpm --filter @nur/editor typecheck`

**Step 4: Commit**

```bash
git add apps/editor/
git commit -m "refactor(editor): migrate editor header and drop zone to Park UI components"
```

---

### Task 4: Set up Playwright in the monorepo

**Files:**
- Create: `apps/editor/playwright.config.ts`
- Create: `apps/editor/e2e/project-crud.spec.ts`
- Modify: `apps/editor/package.json` (add playwright devDep + scripts)
- Modify: `turbo.json` (add e2e task)

**Step 1: Install Playwright**

```bash
pnpm --filter @nur/editor add -D @playwright/test
pnpm --filter @nur/editor exec playwright install chromium
```

**Step 2: Create Playwright config**

Create `apps/editor/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
})
```

**Step 3: Add scripts to package.json**

Add to `apps/editor/package.json` scripts:

```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui"
```

**Step 4: Add e2e task to turbo.json**

Add to the root `turbo.json` tasks:

```json
"e2e": {
  "dependsOn": ["^build"],
  "cache": false
}
```

**Step 5: Commit**

```bash
git add apps/editor/playwright.config.ts apps/editor/package.json turbo.json
git commit -m "chore(editor): set up Playwright for e2e testing"
```

---

### Task 5: Write e2e test — project CRUD

**Files:**
- Create: `apps/editor/e2e/project-crud.spec.ts`

**Step 1: Write the test**

Create `apps/editor/e2e/project-crud.spec.ts`:

```ts
import { test, expect } from "@playwright/test"

test.describe("Project management", () => {
  test.beforeEach(async ({ page }) => {
    // Clear IndexedDB to start fresh
    await page.goto("/")
    await page.evaluate(() => {
      indexedDB.deleteDatabase("nur-project-index")
    })
    await page.reload()
    await page.waitForLoadState("networkidle")
  })

  test("shows empty state on first load", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("No projects yet")).toBeVisible()
  })

  test("creates a project and navigates to editor", async ({ page }) => {
    await page.goto("/")

    // Type project name and create
    await page.getByPlaceholder("New project name").fill("Test Animation")
    await page.getByRole("button", { name: "Create" }).click()

    // Should navigate to editor
    await expect(page).toHaveURL(/\/project\//)
    await expect(page.getByText("Test Animation")).toBeVisible()
  })

  test("creates a project with Enter key", async ({ page }) => {
    await page.goto("/")

    await page.getByPlaceholder("New project name").fill("Enter Project")
    await page.getByPlaceholder("New project name").press("Enter")

    await expect(page).toHaveURL(/\/project\//)
  })

  test("project persists after reload", async ({ page }) => {
    await page.goto("/")

    // Create project
    await page.getByPlaceholder("New project name").fill("Persistent Project")
    await page.getByRole("button", { name: "Create" }).click()

    // Go back to list
    await page.getByText("Back").click()
    await expect(page.getByText("Persistent Project")).toBeVisible()

    // Reload and verify
    await page.reload()
    await page.waitForLoadState("networkidle")
    await expect(page.getByText("Persistent Project")).toBeVisible()
  })

  test("deletes a project", async ({ page }) => {
    await page.goto("/")

    // Create project
    await page.getByPlaceholder("New project name").fill("Delete Me")
    await page.getByRole("button", { name: "Create" }).click()

    // Go back
    await page.getByText("Back").click()
    await expect(page.getByText("Delete Me")).toBeVisible()

    // Delete
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(page.getByText("Delete Me")).not.toBeVisible()
    await expect(page.getByText("No projects yet")).toBeVisible()
  })
})
```

**Step 2: Run the tests**

Run: `pnpm --filter @nur/editor e2e`
Expected: All tests pass. The webServer config starts Vite automatically.

**Step 3: Commit**

```bash
git add apps/editor/e2e/
git commit -m "test(editor): add Playwright e2e tests for project CRUD"
```

---

### Task 6: Write e2e test — frame import and timeline

**Files:**
- Create: `apps/editor/e2e/frame-import.spec.ts`
- Create: `apps/editor/e2e/fixtures/` (test images)

**Step 1: Create test fixture images**

Create a few small PNG files programmatically in the test setup. Playwright can create test files via `page.setInputFiles`.

**Step 2: Write the test**

Create `apps/editor/e2e/frame-import.spec.ts`:

```ts
import { test, expect } from "@playwright/test"
import path from "path"
import fs from "fs"

// Create a minimal 1x1 PNG for testing
function createTestPng(index: number): Buffer {
  // Minimal valid PNG (1x1 red pixel)
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8 + index, 0xcf, 0xc0, 0x00, // pixel data (varies by index)
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
    0x44, 0xae, 0x42, 0x60, 0x82,
  ])
  return header
}

test.describe("Frame import and timeline", () => {
  let testDir: string

  test.beforeAll(async () => {
    // Create temp directory with test PNGs
    testDir = path.join(__dirname, "fixtures", "test-frames")
    fs.mkdirSync(testDir, { recursive: true })
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(path.join(testDir, `frame${i + 1}.png`), createTestPng(i))
    }
  })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await page.evaluate(() => {
      indexedDB.deleteDatabase("nur-project-index")
      indexedDB.deleteDatabase("nur-blobs")
    })
    await page.reload()
    await page.waitForLoadState("networkidle")

    // Create a project first
    await page.getByPlaceholder("New project name").fill("Frame Test")
    await page.getByRole("button", { name: "Create" }).click()
    await expect(page).toHaveURL(/\/project\//)
  })

  test("shows drop zone when no frames", async ({ page }) => {
    await expect(page.getByText("Drop image files here")).toBeVisible()
  })

  test("imports frames via file picker", async ({ page }) => {
    // The FrameDropZone creates a hidden file input on click.
    // We intercept the filechooser event.
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Drop image files here").click(),
    ])

    await fileChooser.setFiles([
      path.join(testDir, "frame1.png"),
      path.join(testDir, "frame2.png"),
      path.join(testDir, "frame3.png"),
    ])

    // Wait for frames to appear
    await expect(page.getByText("3 frames")).toBeVisible({ timeout: 10000 })
  })

  test("timeline shows after import and allows frame navigation", async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Drop image files here").click(),
    ])

    await fileChooser.setFiles([
      path.join(testDir, "frame1.png"),
      path.join(testDir, "frame2.png"),
      path.join(testDir, "frame3.png"),
    ])

    await expect(page.getByText("3 frames")).toBeVisible({ timeout: 10000 })

    // Frame indicator should show current frame
    await expect(page.getByText("Frame 1 / 3")).toBeVisible()
  })
})
```

**Step 3: Run the tests**

Run: `pnpm --filter @nur/editor e2e`
Expected: All tests pass.

**Step 4: Add e2e fixtures to gitignore if needed, commit**

```bash
git add apps/editor/e2e/
git commit -m "test(editor): add Playwright e2e tests for frame import and timeline"
```

---

### Task 7: Add gitignore entries and CI considerations

**Files:**
- Modify: `.gitignore`

**Step 1: Add Playwright output dirs to gitignore**

Add to `.gitignore`:

```
# Playwright
playwright-report/
test-results/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add Playwright output dirs to gitignore"
```

---

### Task 8: Full verification

**Step 1: Typecheck all**

Run: `pnpm typecheck`

**Step 2: Unit tests**

Run: `pnpm test`

**Step 3: E2E tests**

Run: `pnpm --filter @nur/editor e2e`

**Step 4: Visual verification**

Run: `pnpm --filter @nur/editor dev`
Verify: Project list uses Park UI components (buttons, inputs, cards), editor header is styled properly, all existing functionality works.

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Initialize Park UI CLI and scaffold components |
| 2 | Migrate project list page to Park UI |
| 3 | Migrate editor header and drop zone to Park UI |
| 4 | Set up Playwright in the monorepo |
| 5 | E2E test: project CRUD |
| 6 | E2E test: frame import and timeline |
| 7 | Gitignore for Playwright output |
| 8 | Full verification |
