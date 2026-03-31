# Objective 2: Core Domain + Project Management

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define the initial effect-yjs schemas for projects and frames, wire up y-indexeddb persistence and Yjs awareness, and build the project list screen (create, open, delete) as the app's entry point.

**Architecture:** Each project is a Y.Doc with a schema-first structure defined via effect-yjs. The project list is a separate Y.Doc tracking project metadata. All Y.Docs are persisted locally via y-indexeddb. Awareness state (current frame, active tool, selection, viewport) is typed via `YAwareness`. The editor app uses TanStack Router for navigation between the project list and the editor view.

**Tech Stack:** effect-yjs, Effect Schema, yjs, y-indexeddb, @effect-atom/atom, TanStack Router, Park UI (Ark UI), Panda CSS, React 19

---

### Task 1: Define ProjectMeta schema and project index Y.Doc

**Files:**
- Create: `packages/core/src/schemas/project-meta.ts`
- Create: `packages/core/src/project-index.ts`
- Test: `packages/core/src/schemas/project-meta.test.ts`

**Step 1: Write the failing test**

Create `packages/core/src/schemas/project-meta.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import * as S from "effect/Schema"
import { ProjectMetaSchema } from "./project-meta"

describe("ProjectMetaSchema", () => {
  it("decodes a valid project meta object", () => {
    const data = {
      id: "abc-123",
      name: "My Animation",
      createdAt: 1711468800000,
      updatedAt: 1711468800000,
    }
    const result = S.decodeUnknownSync(ProjectMetaSchema)(data)
    expect(result.id).toBe("abc-123")
    expect(result.name).toBe("My Animation")
  })

  it("rejects missing required fields", () => {
    expect(() => S.decodeUnknownSync(ProjectMetaSchema)({})).toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @nur/core test`
Expected: FAIL — cannot find module `./project-meta`

**Step 3: Write minimal implementation**

Create `packages/core/src/schemas/project-meta.ts`:

```ts
import * as S from "effect/Schema"

export const ProjectMetaSchema = S.Struct({
  id: S.String,
  name: S.String,
  createdAt: S.Number,
  updatedAt: S.Number,
})

export type ProjectMeta = S.Schema.Type<typeof ProjectMetaSchema>
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @nur/core test`
Expected: PASS

**Step 5: Write test for ProjectIndex Y.Doc**

Add to `packages/core/src/schemas/project-meta.test.ts`:

```ts
import { YDocument } from "effect-yjs"
import { ProjectIndexSchema } from "../project-index"

describe("ProjectIndex Y.Doc", () => {
  it("creates a Y.Doc with projects record", () => {
    const { root } = YDocument.make(ProjectIndexSchema)
    const projects = root.focus("projects").syncGet()
    expect(projects).toEqual({})
  })

  it("can add and read a project", () => {
    const { root } = YDocument.make(ProjectIndexSchema)
    const projectsLens = root.focus("projects")
    projectsLens.focus("abc-123").syncSet({
      id: "abc-123",
      name: "Test Project",
      createdAt: 1711468800000,
      updatedAt: 1711468800000,
    })
    const projects = projectsLens.syncGet()
    expect(projects["abc-123"].name).toBe("Test Project")
  })

  it("can delete a project", () => {
    const { root } = YDocument.make(ProjectIndexSchema)
    const projectsLens = root.focus("projects")
    projectsLens.focus("abc-123").syncSet({
      id: "abc-123",
      name: "Test Project",
      createdAt: 1711468800000,
      updatedAt: 1711468800000,
    })
    // Delete by setting the record without the key
    const current = projectsLens.syncGet() ?? {}
    const { "abc-123": _, ...rest } = current
    projectsLens.syncSet(rest)
    expect(projectsLens.syncGet()).toEqual({})
  })
})
```

**Step 6: Run test to verify it fails**

Run: `pnpm --filter @nur/core test`
Expected: FAIL — cannot find module `../project-index`

**Step 7: Implement ProjectIndex**

Create `packages/core/src/project-index.ts`:

```ts
import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { IndexeddbPersistence } from "y-indexeddb"
import { ProjectMetaSchema } from "./schemas/project-meta"

export const ProjectIndexSchema = S.Struct({
  projects: S.Record({ key: S.String, value: ProjectMetaSchema }),
})

export type ProjectIndex = S.Schema.Type<typeof ProjectIndexSchema>

const PROJECT_INDEX_DB = "nur-project-index"

export function createProjectIndex() {
  const { doc, root } = YDocument.make(ProjectIndexSchema)
  const persistence = new IndexeddbPersistence(PROJECT_INDEX_DB, doc)
  return { doc, root, persistence }
}
```

**Step 8: Run tests**

Run: `pnpm --filter @nur/core test`
Expected: PASS

**Step 9: Export from package index**

Update `packages/core/src/index.ts`:

```ts
export { ProjectMetaSchema, type ProjectMeta } from "./schemas/project-meta"
export { ProjectIndexSchema, type ProjectIndex, createProjectIndex } from "./project-index"
```

**Step 10: Typecheck**

Run: `pnpm --filter @nur/core typecheck`
Expected: PASS

**Step 11: Commit**

```bash
git add packages/core/
git commit -m "feat(core): add ProjectMeta schema and ProjectIndex Y.Doc"
```

---

### Task 2: Define Project schema (the per-project Y.Doc)

**Files:**
- Create: `packages/core/src/schemas/frame.ts`
- Create: `packages/core/src/project-doc.ts`
- Test: `packages/core/src/project-doc.test.ts`

**Step 1: Write the failing test**

Create `packages/core/src/project-doc.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { YDocument } from "effect-yjs"
import { ProjectDocSchema } from "./project-doc"

describe("ProjectDoc Y.Doc", () => {
  it("creates a Y.Doc with project name and empty frames", () => {
    const { root } = YDocument.make(ProjectDocSchema)
    expect(root.focus("name").syncGet()).toBe("")
    expect(root.focus("frames").syncGet()).toEqual({})
  })

  it("can set project name", () => {
    const { root } = YDocument.make(ProjectDocSchema)
    root.focus("name").syncSet("My Animation")
    expect(root.focus("name").syncGet()).toBe("My Animation")
  })

  it("can add a frame", () => {
    const { root } = YDocument.make(ProjectDocSchema)
    root.focus("frames").focus("frame-001").syncSet({
      id: "frame-001",
      index: 0,
      contentHash: "sha256-abc123",
      width: 1920,
      height: 1080,
    })
    const frame = root.focus("frames").focus("frame-001").syncGet()
    expect(frame.contentHash).toBe("sha256-abc123")
    expect(frame.width).toBe(1920)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @nur/core test`
Expected: FAIL

**Step 3: Implement Frame schema**

Create `packages/core/src/schemas/frame.ts`:

```ts
import * as S from "effect/Schema"

export const FrameSchema = S.Struct({
  id: S.String,
  index: S.Number,
  contentHash: S.String,
  width: S.Number,
  height: S.Number,
})

export type Frame = S.Schema.Type<typeof FrameSchema>
```

**Step 4: Implement ProjectDoc**

Create `packages/core/src/project-doc.ts`:

```ts
import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { IndexeddbPersistence } from "y-indexeddb"
import { FrameSchema } from "./schemas/frame"

export const ProjectDocSchema = S.Struct({
  name: S.String,
  frames: S.Record({ key: S.String, value: FrameSchema }),
})

export type ProjectDoc = S.Schema.Type<typeof ProjectDocSchema>

export function createProjectDoc(projectId: string) {
  const { doc, root } = YDocument.make(ProjectDocSchema)
  const persistence = new IndexeddbPersistence(`nur-project-${projectId}`, doc)
  return { doc, root, persistence }
}
```

**Step 5: Run tests**

Run: `pnpm --filter @nur/core test`
Expected: PASS

**Step 6: Export from package index**

Update `packages/core/src/index.ts` to add:

```ts
export { FrameSchema, type Frame } from "./schemas/frame"
export { ProjectDocSchema, type ProjectDoc, createProjectDoc } from "./project-doc"
```

**Step 7: Typecheck and commit**

Run: `pnpm --filter @nur/core typecheck`

```bash
git add packages/core/
git commit -m "feat(core): add Frame schema and ProjectDoc Y.Doc"
```

---

### Task 3: Define Awareness schema

**Files:**
- Create: `packages/core/src/schemas/awareness.ts`
- Test: `packages/core/src/schemas/awareness.test.ts`

**Step 1: Write the failing test**

Create `packages/core/src/schemas/awareness.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import * as Y from "yjs"
import { YAwareness } from "effect-yjs"
import { AwarenessSchema } from "./awareness"

describe("AwarenessSchema", () => {
  it("creates awareness handle from Y.Doc", () => {
    const doc = new Y.Doc()
    const handle = YAwareness.make(AwarenessSchema, doc)
    expect(handle.clientID).toBeGreaterThan(0)
  })

  it("can set and read local awareness state", () => {
    const doc = new Y.Doc()
    const handle = YAwareness.make(AwarenessSchema, doc)
    handle.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    const state = handle.local.syncGet()
    expect(state.currentFrame).toBe(0)
    expect(state.activeTool).toBe("select")
    expect(state.viewport.zoom).toBe(1)
  })

  it("can update individual fields via focus", () => {
    const doc = new Y.Doc()
    const handle = YAwareness.make(AwarenessSchema, doc)
    handle.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    handle.local.focus("currentFrame").syncSet(5)
    expect(handle.local.focus("currentFrame").syncGet()).toBe(5)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @nur/core test`
Expected: FAIL

**Step 3: Implement AwarenessSchema**

Create `packages/core/src/schemas/awareness.ts`:

```ts
import * as S from "effect/Schema"

export const ViewportSchema = S.Struct({
  x: S.Number,
  y: S.Number,
  zoom: S.Number,
})

export type Viewport = S.Schema.Type<typeof ViewportSchema>

export const AwarenessSchema = S.Struct({
  currentFrame: S.Number,
  activeTool: S.String,
  selection: S.Array(S.String),
  viewport: ViewportSchema,
})

export type AwarenessState = S.Schema.Type<typeof AwarenessSchema>
```

**Step 4: Run tests**

Run: `pnpm --filter @nur/core test`
Expected: PASS

**Step 5: Export and commit**

Update `packages/core/src/index.ts` to add:

```ts
export { AwarenessSchema, ViewportSchema, type AwarenessState, type Viewport } from "./schemas/awareness"
```

Run: `pnpm --filter @nur/core typecheck`

```bash
git add packages/core/
git commit -m "feat(core): add Awareness schema with viewport, tool, selection state"
```

---

### Task 4: Install TanStack Router and set up app routing

**Files:**
- Modify: `apps/editor/package.json` (add @tanstack/react-router)
- Create: `apps/editor/src/routes/__root.tsx`
- Create: `apps/editor/src/routes/index.tsx`
- Create: `apps/editor/src/routes/project.$id.tsx`
- Create: `apps/editor/src/router.ts`
- Modify: `apps/editor/src/app.tsx`
- Modify: `apps/editor/vite.config.ts`

**Step 1: Add TanStack Router dependencies**

Add to `apps/editor/package.json` dependencies:

```json
"@tanstack/react-router": "^1.130.12"
```

Add to devDependencies:

```json
"@tanstack/router-plugin": "^1.130.15"
```

Run: `pnpm install`

**Step 2: Update vite.config.ts to include router plugin**

```ts
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["y-indexeddb"],
  },
})
```

**Step 3: Create root route**

Create `apps/editor/src/routes/__root.tsx`:

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({
  component: () => <Outlet />,
})
```

**Step 4: Create project list route (index)**

Create `apps/editor/src/routes/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { css } from "../../styled-system/css"

export const Route = createFileRoute("/")({
  component: ProjectListPage,
})

function ProjectListPage() {
  return (
    <div className={css({ p: "6" })}>
      <h1 className={css({ fontSize: "2xl", fontWeight: "bold", mb: "4" })}>
        NUR Projects
      </h1>
      <p>Project list will go here.</p>
    </div>
  )
}
```

**Step 5: Create project editor route**

Create `apps/editor/src/routes/project.$id.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { css } from "../../styled-system/css"

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

function ProjectEditorPage() {
  const { id } = Route.useParams()
  return (
    <div className={css({ p: "6" })}>
      <h1 className={css({ fontSize: "2xl", fontWeight: "bold" })}>
        Editor: {id}
      </h1>
    </div>
  )
}
```

**Step 6: Update app.tsx to use the router**

Replace `apps/editor/src/app.tsx`:

```tsx
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function App() {
  return <RouterProvider router={router} />
}
```

**Step 7: Run panda codegen (routes may use styled-system imports)**

Run: `pnpm --filter @nur/editor prepare`

**Step 8: Verify typecheck**

Run: `pnpm --filter @nur/editor typecheck`
Expected: PASS

**Step 9: Verify dev server**

Run: `pnpm --filter @nur/editor dev`
Expected: Vite starts, page shows "NUR Projects" at `/`, shows "Editor: {id}" at `/project/test-123`

**Step 10: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): add TanStack Router with project list and editor routes"
```

---

### Task 5: Build project list page with create/delete functionality

**Files:**
- Create: `apps/editor/src/hooks/use-project-index.ts`
- Modify: `apps/editor/src/routes/index.tsx`

**Step 1: Create the project index hook**

Create `apps/editor/src/hooks/use-project-index.ts`:

```ts
import { useEffect, useState, useRef } from "react"
import { createProjectIndex, type ProjectMeta } from "@nur/core"
import type { YDocumentRoot } from "effect-yjs"
import type { ProjectIndex } from "@nur/core"

let _instance: ReturnType<typeof createProjectIndex> | null = null

function getProjectIndex() {
  if (!_instance) {
    _instance = createProjectIndex()
  }
  return _instance
}

export function useProjectIndex() {
  const { root, doc } = getProjectIndex()
  const [projects, setProjects] = useState<Record<string, ProjectMeta>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const update = () => {
      const data = root.focus("projects").syncGet() ?? {}
      setProjects(data)
    }

    // Listen to Y.Doc changes
    doc.on("update", update)

    // Wait for IndexedDB to load
    const pi = getProjectIndex()
    pi.persistence.once("synced", () => {
      update()
      setReady(true)
    })

    // Initial read in case already synced
    update()

    return () => {
      doc.off("update", update)
    }
  }, [])

  const createProject = (name: string): string => {
    const id = crypto.randomUUID()
    const now = Date.now()
    root.focus("projects").focus(id).syncSet({
      id,
      name,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  const deleteProject = (id: string) => {
    const current = root.focus("projects").syncGet() ?? {}
    const { [id]: _, ...rest } = current
    root.focus("projects").syncSet(rest)
  }

  return { projects, ready, createProject, deleteProject }
}
```

**Step 2: Build the project list UI**

Replace `apps/editor/src/routes/index.tsx`:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "../../styled-system/css"
import { useProjectIndex } from "../hooks/use-project-index"

export const Route = createFileRoute("/")({
  component: ProjectListPage,
})

function ProjectListPage() {
  const { projects, ready, createProject, deleteProject } = useProjectIndex()
  const navigate = useNavigate()
  const [newName, setNewName] = useState("")

  const handleCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const id = createProject(trimmed)
    setNewName("")
    navigate({ to: "/project/$id", params: { id } })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate()
  }

  const projectList = Object.values(projects).sort(
    (a, b) => b.updatedAt - a.updatedAt
  )

  if (!ready) {
    return (
      <div className={css({ display: "flex", justifyContent: "center", alignItems: "center", minH: "screen" })}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className={css({ maxW: "2xl", mx: "auto", p: "8" })}>
      <h1 className={css({ fontSize: "3xl", fontWeight: "bold", mb: "6" })}>
        NUR
      </h1>

      <div className={css({ display: "flex", gap: "2", mb: "6" })}>
        <input
          className={css({
            flex: "1",
            px: "3",
            py: "2",
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: "md",
            bg: "bg.default",
            color: "fg.default",
          })}
          type="text"
          placeholder="New project name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={css({
            px: "4",
            py: "2",
            bg: "bg.emphasized",
            color: "fg.default",
            borderRadius: "md",
            cursor: "pointer",
            _hover: { bg: "bg.muted" },
          })}
          onClick={handleCreate}
        >
          Create
        </button>
      </div>

      {projectList.length === 0 ? (
        <p className={css({ color: "fg.muted" })}>
          No projects yet. Create one to get started.
        </p>
      ) : (
        <ul className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
          {projectList.map((project) => (
            <li
              key={project.id}
              className={css({
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                p: "3",
                border: "1px solid",
                borderColor: "border.default",
                borderRadius: "md",
                cursor: "pointer",
                _hover: { bg: "bg.muted" },
              })}
              onClick={() => navigate({ to: "/project/$id", params: { id: project.id } })}
            >
              <div>
                <div className={css({ fontWeight: "medium" })}>{project.name}</div>
                <div className={css({ fontSize: "sm", color: "fg.muted" })}>
                  {new Date(project.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                className={css({
                  px: "2",
                  py: "1",
                  fontSize: "sm",
                  color: "fg.muted",
                  borderRadius: "sm",
                  cursor: "pointer",
                  _hover: { bg: "bg.subtle", color: "fg.default" },
                })}
                onClick={(e) => {
                  e.stopPropagation()
                  deleteProject(project.id)
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Step 3: Run panda codegen**

Run: `pnpm --filter @nur/editor prepare`

**Step 4: Typecheck**

Run: `pnpm --filter @nur/editor typecheck`
Expected: PASS

**Step 5: Verify in browser**

Run: `pnpm --filter @nur/editor dev`
Expected: Project list page at `/`. Can type a name, click Create, navigates to `/project/{uuid}`. Going back shows the project listed. Click Delete removes it.

**Step 6: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): build project list page with create and delete"
```

---

### Task 6: Wire up project editor route with ProjectDoc

**Files:**
- Create: `apps/editor/src/hooks/use-project-doc.ts`
- Modify: `apps/editor/src/routes/project.$id.tsx`

**Step 1: Create the project doc hook**

Create `apps/editor/src/hooks/use-project-doc.ts`:

```ts
import { useEffect, useState, useRef } from "react"
import { createProjectDoc } from "@nur/core"
import type { YDocumentRoot } from "effect-yjs"
import type { ProjectDoc } from "@nur/core"

const cache = new Map<string, ReturnType<typeof createProjectDoc>>()

function getProjectDoc(projectId: string) {
  let instance = cache.get(projectId)
  if (!instance) {
    instance = createProjectDoc(projectId)
    cache.set(projectId, instance)
  }
  return instance
}

export function useProjectDoc(projectId: string) {
  const { root, doc, persistence } = getProjectDoc(projectId)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    persistence.once("synced", () => {
      setReady(true)
    })
    // May already be synced
    if (persistence.synced) {
      setReady(true)
    }
  }, [projectId])

  return { root, doc, ready }
}
```

**Step 2: Update the editor route to use the hook**

Replace `apps/editor/src/routes/project.$id.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "../../styled-system/css"
import { useProjectDoc } from "../hooks/use-project-doc"

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

function ProjectEditorPage() {
  const { id } = Route.useParams()
  const { root, ready } = useProjectDoc(id)

  if (!ready) {
    return (
      <div className={css({ display: "flex", justifyContent: "center", alignItems: "center", minH: "screen" })}>
        <p>Loading project...</p>
      </div>
    )
  }

  const name = root.focus("name").syncGet() || "Untitled"
  const frames = root.focus("frames").syncGet() ?? {}
  const frameCount = Object.keys(frames).length

  return (
    <div className={css({ h: "screen", display: "flex", flexDirection: "column" })}>
      <header className={css({
        display: "flex",
        alignItems: "center",
        gap: "4",
        px: "4",
        py: "2",
        borderBottom: "1px solid",
        borderColor: "border.default",
      })}>
        <Link
          to="/"
          className={css({ color: "fg.muted", _hover: { color: "fg.default" } })}
        >
          Back
        </Link>
        <h1 className={css({ fontSize: "lg", fontWeight: "medium" })}>{name}</h1>
        <span className={css({ fontSize: "sm", color: "fg.muted" })}>
          {frameCount} frames
        </span>
      </header>
      <main className={css({ flex: "1", display: "flex", alignItems: "center", justifyContent: "center" })}>
        <p className={css({ color: "fg.muted" })}>
          Editor canvas will go here (Objective 3+)
        </p>
      </main>
    </div>
  )
}
```

**Step 3: Run panda codegen**

Run: `pnpm --filter @nur/editor prepare`

**Step 4: Typecheck**

Run: `pnpm --filter @nur/editor typecheck`
Expected: PASS

**Step 5: Verify in browser**

Run: `pnpm --filter @nur/editor dev`
Expected: Creating a project navigates to editor view. Shows project name, "0 frames", "Back" link returns to project list. Data persists across page reloads.

**Step 6: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): wire project editor route with ProjectDoc and y-indexeddb persistence"
```

---

### Task 7: Set project name on creation

**Files:**
- Modify: `apps/editor/src/hooks/use-project-index.ts`

When a project is created in the index, we also need to initialize the project Y.Doc with the project name so the editor route can read it.

**Step 1: Update createProject to also initialize the ProjectDoc**

In `apps/editor/src/hooks/use-project-index.ts`, update the `createProject` function:

```ts
import { createProjectIndex, createProjectDoc, type ProjectMeta } from "@nur/core"

// ... existing code ...

  const createProject = (name: string): string => {
    const id = crypto.randomUUID()
    const now = Date.now()
    root.focus("projects").focus(id).syncSet({
      id,
      name,
      createdAt: now,
      updatedAt: now,
    })
    // Initialize the project Y.Doc with the name
    const { root: projectRoot } = createProjectDoc(id)
    projectRoot.focus("name").syncSet(name)
    return id
  }
```

**Step 2: Typecheck**

Run: `pnpm --filter @nur/editor typecheck`
Expected: PASS

**Step 3: Verify in browser**

Create a new project — the editor page should now show the project name you typed, not "Untitled".

**Step 4: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): initialize ProjectDoc name when creating a project"
```

---

### Task 8: Run full pipeline verification

**Step 1: Typecheck all**

Run: `pnpm typecheck`
Expected: All packages pass.

**Step 2: Test all**

Run: `pnpm test`
Expected: All tests pass.

**Step 3: Dev server**

Run: `pnpm --filter @nur/editor dev`
Expected: Full flow works — list projects, create, open, see name, go back, delete. Data persists across reloads.

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | ProjectMeta schema + ProjectIndex Y.Doc (project registry) |
| 2 | Frame schema + ProjectDoc Y.Doc (per-project document) |
| 3 | Awareness schema (current frame, tool, selection, viewport) |
| 4 | TanStack Router setup with list and editor routes |
| 5 | Project list page with create/delete UI |
| 6 | Editor route wired to ProjectDoc with y-indexeddb persistence |
| 7 | Initialize project name on creation |
| 8 | Full pipeline verification |
