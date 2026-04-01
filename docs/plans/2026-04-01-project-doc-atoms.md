# Project Doc Atoms — No Y.Doc in React

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all direct Y.Doc/YDocumentRoot access from React components. All project data flows through effect-atom. Projects that don't exist in local storage show a not-found page. Ban `useMemo` alongside `useEffect`/`useState`.

**Architecture:** A `projectDocAtom` family (keyed by projectId) wraps `createProjectDoc` and exposes derived atoms for name, frames, and current frame. React components only see `Atom<Result<...>>` types — never Y.Doc, never `root.focus()`. The route's `beforeLoad` checks the project index atom for existence; the component handles Result states (loading/not-found/ready). `import-atoms.ts` receives the `YDocumentRoot` from the project doc atom internally, not from React props.

**Tech Stack:** `@effect-atom/atom`, `@effect-atom/atom-react`, `@tanstack/react-router`, `effect-yjs`, `eslint`

**Key atom-react hooks reference:**
- `useAtomValue(atom)` — read-only subscription
- `useAtom(writable)` — `[value, set]` tuple
- `useAtomSet(writable)` — write-only
- `useAtomMount(atom)` — mount an atom (trigger its computation) without reading
- `useAtomRefresh(atom)` — get a `() => void` to force recomputation

**Files currently touching Y.Doc from React:**
- `hooks/use-project-doc.ts` — creates Y.Doc, exposes `root`, `doc`, `ready`
- `hooks/use-current-frame.ts` — creates YAwareness from `doc`, exposes atom + setter
- `routes/project.$id.tsx` — calls `root.focus("frames").atom()`, `root.focus("name").syncGet()`
- `lib/import-atoms.ts` — receives `YDocumentRoot` as `ImportArgs.root`
- `hooks/use-project-index.ts` — calls `createProjectDoc` + `root.focus("name").syncSet()` in `createProject`

---

### Task 1: Ban `useMemo` in eslint

**Files:**
- Modify: `apps/editor/eslint.config.js`

**Step 1: Add useMemo to the banned imports list**

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
    },
  },
)
```

**Step 2: Run lint to see all violations**

Run: `cd apps/editor && npx eslint src/ 2>&1 | head -40`
Expected: errors in files using `useMemo` (project.$id.tsx, timeline.tsx, use-project-doc.ts, use-current-frame.ts, use-frame-image.ts)

**Step 3: Commit**

```
chore(editor): ban useMemo in eslint alongside useEffect/useState
```

---

### Task 2: Create `apps/editor/src/lib/project-doc-atoms.ts` — the atom layer over Y.Doc

**Files:**
- Create: `apps/editor/src/lib/project-doc-atoms.ts`

This file replaces `hooks/use-project-doc.ts` and `hooks/use-current-frame.ts`. It creates all project-scoped atoms via `Atom.family`:

**Step 1: Write the file**

```ts
// apps/editor/src/lib/project-doc-atoms.ts
import { Atom } from "@effect-atom/atom"
import { createProjectDoc, createCurrentFrameIndex, ProjectId, type Frame } from "@nur/core"
import { YAwareness } from "effect-yjs"
import { AwarenessSchema } from "@nur/core"
import * as S from "effect/Schema"

const parseProjectId = S.decodeSync(ProjectId)

// -- Internal cache: one Y.Doc per project --

interface ProjectDocEntry {
  readonly root: ReturnType<typeof createProjectDoc>["root"]
  readonly doc: ReturnType<typeof createProjectDoc>["doc"]
  readonly persistence: ReturnType<typeof createProjectDoc>["persistence"]
  readonly awareness: ReturnType<typeof createCurrentFrameIndex>
}

const docCache = new Map<string, ProjectDocEntry>()

function getOrCreateProjectDoc(projectId: string): ProjectDocEntry {
  let entry = docCache.get(projectId)
  if (!entry) {
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
    entry = { root, doc, persistence, awareness: frameIndex }
    docCache.set(projectId, entry)
  }
  return entry
}

// -- Public accessor for non-React code (import-atoms needs the root) --

export function getProjectDocRoot(projectId: string) {
  return getOrCreateProjectDoc(projectId).root
}

// -- Atoms --

/** Whether IndexedDB persistence has synced for this project's Y.Doc */
export const projectReadyAtom = Atom.family((projectId: string) =>
  Atom.make((get) => {
    const { persistence } = getOrCreateProjectDoc(projectId)
    if (persistence.synced) return true
    const handler = () => get.setSelf(true)
    persistence.once("synced", handler)
    get.addFinalizer(() => persistence.off("synced", handler))
    return false
  }),
)

/** Project name, reactive from Y.Doc */
export const projectNameAtom = Atom.family((projectId: string) => {
  const { root } = getOrCreateProjectDoc(projectId)
  return root.focus("name").atom()
})

/** Frames record from Y.Doc, sorted by index */
export const framesAtom = Atom.family((projectId: string) => {
  const { root } = getOrCreateProjectDoc(projectId)
  const rawAtom = root.focus("frames").atom()
  return Atom.make((get) => {
    const record = (get(rawAtom) as Record<string, Frame> | undefined) ?? {}
    return Object.values(record).sort((a, b) => a.index - b.index)
  })
})

/** Current frame index, reactive from YAwareness */
export const currentFrameAtom = Atom.family((projectId: string) => {
  const { awareness } = getOrCreateProjectDoc(projectId)
  return Atom.map(awareness.atom, (v) => (v as number | undefined) ?? 0)
})

/** Setter for current frame — synchronous, for use from React and atoms */
export function setCurrentFrame(projectId: string, index: number) {
  const { awareness } = getOrCreateProjectDoc(projectId)
  awareness.set(index)
}
```

**Step 2: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.json`

Type errors are expected — other files still use the old hooks. Fix any errors in this file only.

**Step 3: Commit**

```
feat(editor): add project-doc-atoms — atom layer over Y.Doc
```

---

### Task 3: Update `import-atoms.ts` — remove `YDocumentRoot` from `ImportArgs`

**Files:**
- Modify: `apps/editor/src/lib/import-atoms.ts`

The import fn should get the Y.Doc root internally via `getProjectDocRoot(projectId)`, not from React props.

**Step 1: Update ImportArgs and the fn**

Change `ImportArgs` to:
```ts
export interface ImportArgs {
  readonly files: FileList
  readonly projectId: string
}
```

Inside the Effect, get the root:
```ts
import { getProjectDocRoot } from "./project-doc-atoms"

// Inside the Effect:
const root = getProjectDocRoot(args.projectId)
const framesRecord = (root.focus("frames").syncGet() ?? {}) as Record<string, Frame>
const startIndex = Object.keys(framesRecord).length
```

Remove `startIndex` from args — compute it from the current frame count.

**Step 2: Verify typecheck**

Expect errors in `project.$id.tsx` where it passes `{ files, root, startIndex }` — that's fixed in Task 5.

**Step 3: Commit**

```
refactor(editor): decouple import-atoms from YDocumentRoot prop
```

---

### Task 4: Update `use-frame-image.ts` — remove useMemo

**Files:**
- Modify: `apps/editor/src/hooks/use-frame-image.ts`

Replace `useMemo` with `Atom.family` or `Atom.make` for the conditional atom selection:

```ts
import { Atom, Result } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { frameImageAtom } from "../lib/frame-image-cache"

const emptyAtom = Atom.make(Result.initial<HTMLImageElement, Error>()).pipe(Atom.keepAlive)

// Use Atom.family to memoize the conditional selection
const frameImageOrEmptyAtom = Atom.family((contentHash: string) =>
  frameImageAtom(contentHash),
)

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const atom = contentHash ? frameImageOrEmptyAtom(contentHash) : emptyAtom
  const result = useAtomValue(atom)
  return Result.isSuccess(result) ? result.value : undefined
}
```

Wait — `frameImageAtom` is already an `Atom.family`, so `frameImageAtom(contentHash)` is already memoized. The `useMemo` was unnecessary. Simplify to:

```ts
import { Result } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { frameImageAtom, emptyImageAtom } from "../lib/frame-image-cache"

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const result = useAtomValue(contentHash ? frameImageAtom(contentHash) : emptyImageAtom)
  return Result.isSuccess(result) ? result.value : undefined
}
```

Move `emptyAtom` to `frame-image-cache.ts` and export it as `emptyImageAtom`.

**Step 1: Move emptyAtom to frame-image-cache.ts**

Add to bottom of `frame-image-cache.ts`:
```ts
import { Result } from "@effect-atom/atom"
export const emptyImageAtom = Atom.make(Result.initial<HTMLImageElement, Error>()).pipe(Atom.keepAlive)
```

**Step 2: Simplify use-frame-image.ts**

```ts
import { Result } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { frameImageAtom, emptyImageAtom } from "../lib/frame-image-cache"

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const result = useAtomValue(contentHash ? frameImageAtom(contentHash) : emptyImageAtom)
  return Result.isSuccess(result) ? result.value : undefined
}
```

**Step 3: Verify typecheck**

**Step 4: Commit**

```
refactor(editor): remove useMemo from use-frame-image
```

---

### Task 5: Rewrite `routes/project.$id.tsx` — no Y.Doc, no useMemo, not-found handling

**Files:**
- Modify: `apps/editor/src/routes/project.$id.tsx`

This is the biggest change. The component:
- Reads `projectReadyAtom(id)` for loading state
- Checks `projectsAtom` (from use-project-index) for existence → not-found
- Reads `framesAtom(id)`, `currentFrameAtom(id)`, `projectNameAtom(id)` for data
- Calls `setCurrentFrame(id, index)` for navigation
- Uses `importFnAtom(id)` with simplified args `{ files, projectId: id }`
- All `useMemo(() => Atom.make(...))` for resize observers and hotkeys are replaced with module-level `Atom.family` atoms or inline derived atoms without `useMemo`

**Step 1: Rewrite the component**

```tsx
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router"
import { useRef, useCallback } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet, useAtomMount } from "@effect-atom/atom-react/Hooks"
import { FrameDropZone } from "../components/frame-drop-zone"
import { FrameCanvas } from "../components/frame-canvas"
import { Timeline } from "../components/timeline"
import { importFnAtom, importProgressAtom } from "../lib/import-atoms"
import { projectReadyAtom, projectNameAtom, framesAtom, currentFrameAtom, setCurrentFrame } from "../lib/project-doc-atoms"
import { projectsAtom } from "../hooks/use-project-index"
import { registerHotkeyContext, unregisterHotkeyContext } from "../actors/hotkey-manager"
import { Button } from "@/components/ui/button"

const canvasSizeAtom = Atom.make({ width: 0, height: 0 })
const timelineWidthAtom = Atom.make(0)

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

// -- Resize observer atoms (module-level, not per-render) --

function makeResizeAtom(targetAtom: Atom.Writable<any>, getEl: () => HTMLElement | null) {
  return Atom.make((get) => {
    const el = getEl()
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const rect = entry.contentRect
      if (targetAtom === canvasSizeAtom) {
        get.set(canvasSizeAtom, { width: Math.floor(rect.width), height: Math.floor(rect.height) })
      } else {
        get.set(timelineWidthAtom, Math.floor(rect.width))
      }
    })
    observer.observe(el)
    get.addFinalizer(() => observer.disconnect())
  })
}

function ProjectEditorPage() {
  const { id } = Route.useParams()

  // -- Existence check --
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

  // -- Loading state --
  const ready = useAtomValue(projectReadyAtom(id))
  if (!ready) {
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

  // -- Data atoms --
  const name = useAtomValue(projectNameAtom(id)) as string | undefined
  const frames = useAtomValue(framesAtom(id))
  const currentFrame = useAtomValue(currentFrameAtom(id))
  const canvasSize = useAtomValue(canvasSizeAtom)
  const timelineWidth = useAtomValue(timelineWidthAtom)

  const frameCount = frames.length
  const currentFrameData = frames.find((f) => f.index === currentFrame)

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

  // -- Resize observers (inline atoms, useAtomMount) --
  // These atoms are created fresh each render but Atom.make with the same
  // closure is cheap — useAtomMount handles mount/unmount properly.
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
          handler: () => setCurrentFrame(id, Math.min(currentFrame + 1, frameCount - 1)),
        },
        {
          key: "ArrowLeft",
          handler: () => setCurrentFrame(id, Math.max(currentFrame - 1, 0)),
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
          onFrameSelect={(index) => setCurrentFrame(id, index)}
          width={timelineWidth}
        />
      </div>
    </div>
  )
}
```

Note: The early return for not-found before other hooks is fine — it's a conditional render that prevents the rest of the component from mounting. We split into `ProjectEditorPage` (guard) and `ProjectEditor` (hooks) so hooks aren't called conditionally.

**Step 2: Verify typecheck**

Run: `npx tsc --noEmit -p apps/editor/tsconfig.json`

**Step 3: Commit**

```
refactor(editor): remove Y.Doc access and useMemo from project editor
```

---

### Task 6: Remove `useMemo` from `components/timeline.tsx`

**Files:**
- Modify: `apps/editor/src/components/timeline.tsx`

Three `useMemo` calls to remove:
1. `scrubbingListenerAtom` — move to inline `Atom.make` without `useMemo`
2. `wheelZoomAtom` — same
3. `frameCells` — this is a render optimization (memoizing JSX elements). Replace with an `Atom.make` derived atom, or just compute inline (Konva cells are lightweight).

For (1) and (2): same pattern as project.$id.tsx — inline `Atom.make` + `useAtomMount`.

For (3) `frameCells`: this is pure rendering logic that depends on `frameCount`, `currentFrame`, `cellWidth`, `zoomLevel`. It's not reactive state — it's derived render output. The simplest fix: compute it inline without memoization. Konva `Rect`/`Text`/`Line` elements are cheap to create. If perf becomes an issue later, use an atom.

**Step 1: Replace useMemo with inline atoms and direct computation**

Remove `useMemo` from import. Keep `useRef`, `useCallback`.
- Replace `useMemo(() => Atom.make(...))` with `Atom.make(...)` directly
- Replace `frameCells` useMemo with a plain function call

**Step 2: Verify typecheck**

**Step 3: Commit**

```
refactor(editor): remove useMemo from timeline component
```

---

### Task 7: Delete `hooks/use-project-doc.ts` and `hooks/use-current-frame.ts`

**Files:**
- Delete: `apps/editor/src/hooks/use-project-doc.ts`
- Delete: `apps/editor/src/hooks/use-current-frame.ts`

**Step 1: Verify no remaining imports**

Run: `grep -r "use-project-doc\|use-current-frame\|useProjectDoc\|useCurrentFrame" apps/editor/src/`
Expected: no matches

**Step 2: Delete files**

**Step 3: Commit**

```
refactor(editor): delete replaced Y.Doc hooks
```

---

### Task 8: Final verification — lint clean + typecheck + tests

**Step 1: Run ESLint**

Run: `cd apps/editor && npx eslint src/`
Expected: 0 errors

**Step 2: Run typecheck**

Run: `npx tsc --noEmit -p apps/editor/tsconfig.json`
Expected: no errors

**Step 3: Run core tests**

Run: `cd packages/core && npx vitest run`
Expected: all tests pass

**Step 4: Grep for banned patterns**

Run: `grep -r "useMemo\|useState\|useEffect" apps/editor/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v components/ui`
Expected: no matches

**Step 5: Commit any fixes**

```
chore(editor): verify zero useMemo/useEffect/useState lint compliance
```
