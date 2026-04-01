# Effect Cache for Project Docs — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the native `Map`-based doc cache in `project-doc-atoms.ts` with Effect `Cache`, expose a shared `Atom.runtime`, and ban `Map` usage via ESLint. All React consumers read through atoms; atoms trigger effects through the runtime.

**Architecture:** A shared `projectDocRuntime = Atom.runtime(Layer.empty)` holds the Effect runtime. An Effect `Cache` (capacity 64, infinite TTL) replaces the `Map<string, ProjectDocEntry>`. The cache lookup is effectful — it creates the Y.Doc, awareness, and persistence, then syncs persistence before returning. Each public atom (`projectReadyAtom`, `framesAtom`, etc.) uses `projectDocRuntime.atom(Effect.fnUntraced(...))` to get entries from the cache, then flattens the inner Y.Doc atoms via `Atom.mapResult`. The imperative helpers (`getProjectDocRoot`, `waitForPersistence`, `flushProjectDoc`) become Effect-returning functions. `import-atoms.ts` consumes them as effects instead of wrapping promises.

**Tech Stack:** `effect/Cache`, `effect/Duration`, `@effect-atom/atom`, `effect-yjs`, `eslint` (`no-restricted-syntax`)

**Key files:**
- `apps/editor/src/lib/project-doc-atoms.ts` — main refactor target
- `apps/editor/src/lib/import-atoms.ts` — only external consumer of the imperative helpers
- `apps/editor/src/routes/project.$id.tsx` — React consumer of the atoms (type changes from `Atom<T>` to `Atom<Result<T>>` for some atoms)
- `apps/editor/eslint.config.js` — ban `Map`

---

### Task 1: Ban `Map` in ESLint

**Files:**
- Modify: `apps/editor/eslint.config.js`

**Step 1: Add no-restricted-syntax rule for `new Map`**

`no-restricted-globals` won't catch `new Map()` (it's a constructor call, not a global reference). Use `no-restricted-syntax` targeting the AST node.

```js
// apps/editor/eslint.config.js
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["src/components/ui/**", "src/routeTree.gen.ts"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "react",
            importNames: ["useEffect", "useState", "useMemo"],
            message: "Use effect-atom instead. See CLAUDE.md → effect-atom docs.",
          },
        ],
      }],
      "no-restricted-syntax": ["error", {
        selector: "NewExpression[callee.name='Map']",
        message: "Use MutableHashMap from effect/MutableHashMap or Cache from effect/Cache instead of native Map.",
      }],
    },
  },
)
```

**Step 2: Run lint to see violations**

Run: `cd apps/editor && npx eslint src/ 2>&1 | head -20`
Expected: error in `src/lib/project-doc-atoms.ts` line 19 (`new Map<string, ProjectDocEntry>()`)

**Step 3: Commit**

```
chore(editor): ban native Map usage in eslint — use Effect MutableHashMap or Cache
```

---

### Task 2: Refactor `project-doc-atoms.ts` — Effect Cache + shared runtime

**Files:**
- Modify: `apps/editor/src/lib/project-doc-atoms.ts`

This is the core change. The file goes from imperative Map-based caching to Effect Cache behind a shared runtime.

**Step 1: Rewrite the file**

```ts
// apps/editor/src/lib/project-doc-atoms.ts
import { Atom } from "@effect-atom/atom"
import { createProjectDoc, createCurrentFrameIndex, ProjectId, type Frame } from "@nur/core"
import { YAwareness } from "effect-yjs"
import { AwarenessSchema } from "@nur/core"
import * as S from "effect/Schema"
import * as Effect from "effect/Effect"
import * as Cache from "effect/Cache"
import * as Duration from "effect/Duration"
import * as Layer from "effect/Layer"

const parseProjectId = S.decodeSync(ProjectId)

// -- Types --

interface ProjectDocEntry {
  readonly root: ReturnType<typeof createProjectDoc>["root"]
  readonly doc: ReturnType<typeof createProjectDoc>["doc"]
  readonly persistence: ReturnType<typeof createProjectDoc>["persistence"]
  readonly awareness: ReturnType<typeof createCurrentFrameIndex>
}

// -- Shared runtime --

export const projectDocRuntime = Atom.runtime(Layer.empty)

// -- Cache atom: effectful construction, one Y.Doc per project --

const projectDocCacheAtom = projectDocRuntime.atom(
  Effect.gen(function* () {
    return yield* Cache.make({
      capacity: 64,
      timeToLive: Duration.infinity,
      lookup: (projectId: string) =>
        Effect.sync(() => {
          const id = parseProjectId(projectId)
          const { doc, root, persistence } = createProjectDoc(id)
          const awareness = YAwareness.make(AwarenessSchema, doc)
          awareness.local.syncSet({
            currentFrame: 0,
            activeTool: "select",
            selection: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          })
          const frameIndex = createCurrentFrameIndex(awareness)
          return { root, doc, persistence, awareness: frameIndex } satisfies ProjectDocEntry
        }),
    })
  }),
).pipe(Atom.keepAlive)

// -- Effect-returning helpers (replace imperative getProjectDocRoot etc.) --

/** Get a project doc entry from the cache. Returns Effect. */
export const getProjectDoc = (projectId: string) =>
  Effect.fnUntraced(function* (get: Atom.Context) {
    const cache = yield* get.result(projectDocCacheAtom)
    return yield* Cache.get(cache, projectId)
  })

/** Wait for persistence sync. Returns Effect. */
export const syncProjectDoc = (projectId: string) =>
  Effect.fnUntraced(function* (get: Atom.Context) {
    const entry = yield* getProjectDoc(projectId)(get)
    yield* Effect.promise(() => entry.persistence.sync())
    return entry
  })

/** Flush Y.Doc state to IndexedDB. Returns Effect. */
export const flushProjectDoc = (projectId: string) =>
  Effect.fnUntraced(function* (get: Atom.Context) {
    const entry = yield* getProjectDoc(projectId)(get)
    yield* Effect.promise(() => entry.persistence.flush())
  })

// -- Atoms --

/** Whether IndexedDB persistence has synced for this project's Y.Doc */
export const projectReadyAtom = Atom.family((projectId: string) =>
  projectDocRuntime.atom(
    syncProjectDoc(projectId),
  ).pipe(Atom.mapResult(() => true)),
)

/** Project name, reactive from Y.Doc */
export const projectNameAtom = Atom.family((projectId: string) =>
  Atom.mapResult(
    projectDocRuntime.atom(getProjectDoc(projectId)),
    (entry) => entry.root.focus("name").syncGet(),
  ),
)

/** Frames record from Y.Doc, sorted by index */
export const framesAtom = Atom.family((projectId: string) =>
  Atom.mapResult(
    projectDocRuntime.atom(getProjectDoc(projectId)),
    (entry) => {
      const record = (entry.root.focus("frames").syncGet() ?? {}) as Record<string, Frame>
      return Object.values(record).sort((a, b) => a.index - b.index)
    },
  ),
)

/** Current frame index, reactive from YAwareness */
export const currentFrameAtom = Atom.family((projectId: string) =>
  Atom.mapResult(
    projectDocRuntime.atom(getProjectDoc(projectId)),
    (entry) => entry.awareness.get(),
  ),
)

/** Setter for current frame -- synchronous, for use from React and atoms */
export const setCurrentFrameAtom = Atom.family((projectId: string) =>
  projectDocRuntime.fn(
    Effect.fnUntraced(function* (index: number, get: Atom.Context) {
      const entry = yield* getProjectDoc(projectId)(get)
      entry.awareness.set(index)
    }),
  ),
)
```

**Important design notes:**

- `projectDocCacheAtom` is `keepAlive` — the cache must survive component unmounts.
- `projectReadyAtom` triggers `syncProjectDoc` which calls `persistence.sync()`. The Effect completes when sync is done, so `Result.isSuccess` = ready.
- `projectNameAtom`, `framesAtom`, `currentFrameAtom` are now `Atom<Result<T>>` — React consumers need to handle Result states.
- `setCurrentFrame` changes from a plain function to `setCurrentFrameAtom` (an `Atom.family` of `runtimeAtom.fn`) because it needs cache access. The caller in `project.$id.tsx` will use `useAtomSet(setCurrentFrameAtom(id))`.

**Reactivity concern:** `projectNameAtom` and `framesAtom` use `syncGet()` which reads the current Y.Doc value at effect execution time. They won't re-render when Y.Doc changes because `syncGet` is a snapshot, not a subscription. We need the inner Y.Doc atoms for reactivity.

**Step 2: Fix reactivity — use inner atoms with flatten**

The atoms that need Y.Doc reactivity (`projectNameAtom`, `framesAtom`, `currentFrameAtom`) must subscribe to the Y.Doc's own atoms. Since the cache entry contains `root` (which has `.focus().atom()`), we need a two-level atom: outer gets the entry from cache, inner subscribes to the Y.Doc atom.

Pattern: use `Atom.make` to derive from both the Result atom and the inner Y.Doc atom:

```ts
/** Project name, reactive from Y.Doc */
export const projectNameAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocRuntime.atom(getProjectDoc(projectId))
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    const nameAtom = result.value.root.focus("name").atom()
    return Result.success(get(nameAtom) as string | undefined)
  })
})

/** Frames record from Y.Doc, sorted by index */
export const framesAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocRuntime.atom(getProjectDoc(projectId))
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    const rawAtom = result.value.root.focus("frames").atom()
    const record = (get(rawAtom) as Record<string, Frame> | undefined) ?? {}
    return Result.success(Object.values(record).sort((a, b) => a.index - b.index))
  })
})

/** Current frame index, reactive from YAwareness */
export const currentFrameAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocRuntime.atom(getProjectDoc(projectId))
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    return Result.success(get(result.value.awareness.atom) as number ?? 0)
  })
})
```

This ensures `get()` tracks the inner Y.Doc atom for reactivity, while still gating on the cache Result.

**Step 3: Add Result import**

```ts
import { Atom, Result } from "@effect-atom/atom"
```

**Step 4: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.json 2>&1 | head -40`

Expect errors in `project.$id.tsx` and `import-atoms.ts` — those are fixed in subsequent tasks. This file itself should typecheck.

**Step 5: Commit**

```
refactor(editor): replace Map cache with Effect Cache + shared runtime in project-doc-atoms
```

---

### Task 3: Update `import-atoms.ts` — consume Effect helpers instead of imperative ones

**Files:**
- Modify: `apps/editor/src/lib/import-atoms.ts`

Currently imports `getProjectDocRoot`, `waitForPersistence`, `flushProjectDoc` as plain functions and wraps them with `Effect.promise`. Now they're Effect-returning functions that need `Atom.Context`.

The import fn already runs inside `storageRuntime.fn(Effect.fnUntraced(...))`. The challenge: `getProjectDoc` needs `Atom.Context` (a `get` parameter) but `runtimeAtom.fn` receives `(args, get)` — the `get` is available.

However, `import-atoms.ts` uses its own `storageRuntime` (for `AppBlobStore`). The project doc cache lives in `projectDocRuntime`. We need to compose the layers or use a single runtime.

**Approach:** Import `projectDocRuntime` and compose with `AppBlobStore` layer, or keep separate runtimes and access the cache via the atom registry directly.

Simplest: keep `storageRuntime` for blob operations, and access the project doc cache atom via `get.result(projectDocCacheAtom)` (which works because the cache atom uses `Layer.empty` — no services needed, just needs to be mounted).

**Step 1: Update imports and rewrite the fn**

```ts
// apps/editor/src/lib/import-atoms.ts
import * as Effect from "effect/Effect"
import * as Cache from "effect/Cache"
import { Atom } from "@effect-atom/atom"
import { BlobStore } from "@nur/object-store"
import { sortFramesByName, type Frame } from "@nur/core"
import { FrameId } from "@nur/core"
import * as S from "effect/Schema"
import { AppBlobStore } from "./blob-store-layer"
import { appRegistry } from "./atom-registry"
import { getProjectDoc, flushProjectDoc } from "./project-doc-atoms"

// -- Helpers (moved from project.$id.tsx) --

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load: ${file.name}`))
    }
    img.src = url
  })
}

// -- Types --

export interface ImportProgress {
  readonly total: number
  readonly completed: number
  readonly currentFile: string
}

export interface ImportArgs {
  readonly files: FileList
  readonly projectId: string
}

// -- Atoms --

const makeFrameId = S.decodeSync(FrameId)

const storageRuntime = Atom.runtime(AppBlobStore)

export const importProgressAtom = Atom.family((_projectId: string) =>
  Atom.make<ImportProgress>({ total: 0, completed: 0, currentFile: "" }),
)

export const importFnAtom = Atom.family((projectId: string) =>
  storageRuntime.fn(
    Effect.fnUntraced(function* (args: ImportArgs, get: Atom.Context) {
      const entry = yield* getProjectDoc(args.projectId)(get)
      yield* Effect.promise(() => entry.persistence.sync())
      const { files } = args
      const framesRecord = (entry.root.focus("frames").syncGet() ?? {}) as Record<string, Frame>
      const startIndex = Object.keys(framesRecord).length
      const store = yield* BlobStore

      const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"))
      if (imageFiles.length === 0) return []

      const sorted = sortFramesByName(imageFiles)
      const progressAtom = importProgressAtom(projectId)
      appRegistry.set(progressAtom, { total: sorted.length, completed: 0, currentFile: "" })

      const frames: Array<Frame> = []

      for (let i = 0; i < sorted.length; i++) {
        const file = sorted[i]
        appRegistry.set(progressAtom, { total: sorted.length, completed: i, currentFile: file.name })

        const [buffer, dims] = yield* Effect.promise(() =>
          Promise.all([readFileAsArrayBuffer(file), getImageDimensions(file)]),
        )

        const data = new Uint8Array(buffer)
        const contentHash = yield* store.put(data)
        const id = makeFrameId(crypto.randomUUID())
        const frame: Frame = {
          id,
          index: startIndex + i,
          contentHash: contentHash as Frame["contentHash"],
          width: dims.width,
          height: dims.height,
        }
        entry.root.focus("frames").focus(id).syncSet(frame)
        frames.push(frame)
      }

      appRegistry.set(progressAtom, { total: sorted.length, completed: sorted.length, currentFile: "" })
      yield* flushProjectDoc(args.projectId)(get)
      return frames
    }),
  ),
)
```

**Key changes:**
- `getProjectDocRoot(args.projectId)` → `yield* getProjectDoc(args.projectId)(get)` then use `entry.root`
- `yield* Effect.promise(() => waitForPersistence(...))` → `yield* Effect.promise(() => entry.persistence.sync())`
- `yield* Effect.promise(() => flushProjectDoc(...))` → `yield* flushProjectDoc(args.projectId)(get)`
- The `get: Atom.Context` is the second parameter of `Effect.fnUntraced` callback in `runtimeAtom.fn`

**Step 2: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.json 2>&1 | head -40`

Expect: errors in `project.$id.tsx` only (atom type changes). This file should typecheck.

**Step 3: Commit**

```
refactor(editor): import-atoms consumes Effect Cache instead of imperative helpers
```

---

### Task 4: Update `project.$id.tsx` — handle Result types from new atoms

**Files:**
- Modify: `apps/editor/src/routes/project.$id.tsx`

The atoms now return `Result<T>` wrapping types. Key changes:

1. `projectReadyAtom(id)` was `Atom<boolean>`, now `Atom<Result<true>>` — use `Result.isSuccess` instead of truthy check
2. `projectNameAtom(id)` was `Atom<string | undefined>`, now returns a Result-wrapped value — unwrap with Result matching
3. `framesAtom(id)` was `Atom<Frame[]>`, now Result-wrapped
4. `currentFrameAtom(id)` was `Atom<number>`, now Result-wrapped
5. `setCurrentFrame(id, index)` was a plain function, now `setCurrentFrameAtom(id)` is an `AtomResultFn`

**Step 1: Update the component**

```tsx
// apps/editor/src/routes/project.$id.tsx
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router"
import { useRef, useCallback } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet, useAtomMount } from "@effect-atom/atom-react/Hooks"
import { projectsAtom } from "../hooks/use-project-index"
import {
  projectReadyAtom,
  projectNameAtom,
  framesAtom,
  currentFrameAtom,
  setCurrentFrameAtom,
} from "../lib/project-doc-atoms"
import { FrameDropZone } from "../components/frame-drop-zone"
import { FrameCanvas } from "../components/frame-canvas"
import { Timeline } from "../components/timeline"
import { importFnAtom, importProgressAtom } from "../lib/import-atoms"
import {
  registerHotkeyContext,
  unregisterHotkeyContext,
} from "../actors/hotkey-manager"
import { Button } from "@/components/ui/button"

const canvasSizeAtom = Atom.make({ width: 0, height: 0 })
const timelineWidthAtom = Atom.make(0)

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

function ProjectEditorPage() {
  const { id } = Route.useParams()
  const projects = useAtomValue(projectsAtom)

  if (!(id in projects)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold">Project not found</h1>
        <Button variant="link" asChild>
          <Link to="/">Go to home</Link>
        </Button>
      </div>
    )
  }

  const readyResult = useAtomValue(projectReadyAtom(id))
  if (!Result.isSuccess(readyResult)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  return <ProjectEditor id={id} />
}

function ProjectEditor({ id }: { id: string }) {
  const mainRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  // -- Data atoms (all Result-wrapped, unwrap with fallbacks) --
  const nameResult = useAtomValue(projectNameAtom(id))
  const name = Result.isSuccess(nameResult) ? nameResult.value as string | undefined : undefined

  const framesResult = useAtomValue(framesAtom(id))
  const frames = Result.isSuccess(framesResult) ? framesResult.value : []

  const currentFrameResult = useAtomValue(currentFrameAtom(id))
  const currentFrame = Result.isSuccess(currentFrameResult) ? currentFrameResult.value : 0

  const canvasSize = useAtomValue(canvasSizeAtom)
  const timelineWidth = useAtomValue(timelineWidthAtom)

  const frameCount = frames.length
  const currentFrameData = frames.find((f) => f.index === currentFrame)

  // -- Set current frame (now an atom fn) --
  const triggerSetFrame = useAtomSet(setCurrentFrameAtom(id))

  // -- Import --
  const importFn = importFnAtom(id)
  const triggerImport = useAtomSet(importFn)
  const importResult = useAtomValue(importFn)
  const importProgress = useAtomValue(importProgressAtom(id))
  const isImporting = Result.isWaiting(importResult)

  useBlocker({
    shouldBlockFn: () => {
      if (!isImporting) return false
      const leave = window.confirm("Import in progress. Abort and leave?")
      if (leave) triggerImport(Atom.Interrupt)
      return !leave
    },
    enableBeforeUnload: () => isImporting,
  })

  const handleFilesSelected = useCallback((files: FileList) => {
    triggerImport({ files, projectId: id })
  }, [triggerImport, id])

  // -- Resize observers --
  const canvasResizeAtom = Atom.make((get) => {
    const el = mainRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        get.set(canvasSizeAtom, {
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        })
      }
    })
    observer.observe(el)
    get.addFinalizer(() => observer.disconnect())
  })
  useAtomMount(canvasResizeAtom)

  const timelineResizeAtom = Atom.make((get) => {
    const el = timelineRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        get.set(timelineWidthAtom, Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(el)
    get.addFinalizer(() => observer.disconnect())
  })
  useAtomMount(timelineResizeAtom)

  // -- Hotkeys --
  const hotkeyAtom = Atom.make((get) => {
    registerHotkeyContext({
      id: "editor",
      bindings: [
        {
          key: "ArrowRight",
          handler: () => triggerSetFrame(Math.min(currentFrame + 1, frameCount - 1)),
        },
        {
          key: "ArrowLeft",
          handler: () => triggerSetFrame(Math.max(currentFrame - 1, 0)),
        },
      ],
    })
    get.addFinalizer(() => unregisterHotkeyContext("editor"))
  })
  useAtomMount(hotkeyAtom)

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-border">
        <Button variant="link" asChild>
          <Link to="/">Back</Link>
        </Button>
        <h1 className="text-lg font-semibold">{name || "Untitled"}</h1>
        <p className="text-sm text-muted-foreground">{frameCount} frames</p>
        {frameCount > 0 && (
          <p className="text-sm text-muted-foreground">
            Frame {currentFrame + 1} / {frameCount}
          </p>
        )}
      </header>

      <main ref={mainRef} className="flex-1 relative overflow-hidden">
        {frameCount === 0 || isImporting ? (
          <FrameDropZone
            onFilesSelected={handleFilesSelected}
            progress={importProgress}
            isImporting={isImporting}
          />
        ) : (
          <FrameCanvas
            contentHash={currentFrameData?.contentHash}
            width={canvasSize.width}
            height={canvasSize.height}
            frameWidth={currentFrameData?.width ?? 1}
            frameHeight={currentFrameData?.height ?? 1}
          />
        )}
      </main>

      <div ref={timelineRef}>
        <Timeline
          frameCount={frameCount}
          currentFrame={currentFrame}
          onFrameSelect={(index) => triggerSetFrame(index)}
          width={timelineWidth}
        />
      </div>
    </div>
  )
}
```

**Key changes:**
- All atom values unwrapped from Result with fallbacks
- `setCurrentFrame(id, n)` → `triggerSetFrame(n)` via `useAtomSet(setCurrentFrameAtom(id))`
- Import changed from `setCurrentFrame` to `setCurrentFrameAtom`

**Step 2: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.json`
Expected: no errors

**Step 3: Commit**

```
refactor(editor): update project editor to consume Result-typed atoms
```

---

### Task 5: Remove dead exports from `project-doc-atoms.ts`

**Files:**
- Modify: `apps/editor/src/lib/project-doc-atoms.ts`

After Tasks 2-4, the following exports are no longer needed:
- `getProjectDocRoot` (was consumed by `import-atoms.ts`, now uses `getProjectDoc`)
- `waitForPersistence` (replaced by `syncProjectDoc`)

Check no remaining consumers:

**Step 1: Verify no remaining imports of removed functions**

Run: `grep -r "getProjectDocRoot\|waitForPersistence" apps/editor/src/ --include="*.ts" --include="*.tsx"`
Expected: only `project-doc-atoms.ts` itself (the definitions, which we're removing)

**Step 2: Remove the dead exports**

Remove the `getProjectDocRoot` and `waitForPersistence` functions if they have no consumers. Keep `flushProjectDoc` as it's used by `import-atoms.ts`.

**Step 3: Commit**

```
chore(editor): remove dead imperative helpers from project-doc-atoms
```

---

### Task 6: Final verification — lint clean + typecheck

**Step 1: Run ESLint**

Run: `cd apps/editor && npx eslint src/ 2>&1 | head -40`
Expected: 0 errors (no `new Map`, no banned React hooks)

**Step 2: Run typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.json`
Expected: no errors

**Step 3: Grep for banned patterns**

Run: `grep -rn "new Map" apps/editor/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v components/ui`
Expected: no matches

**Step 4: Manual smoke test**

Open the app, navigate to a project, verify:
- Loading spinner appears briefly
- Project name, frames, and timeline render
- Frame navigation (arrow keys) works
- Import files works

**Step 5: Commit any fixes**

```
chore(editor): verify lint + typecheck clean after Effect Cache migration
```
