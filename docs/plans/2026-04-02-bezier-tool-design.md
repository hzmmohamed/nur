# Bezier Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a pen tool to the editor that lets users draw and edit bezier paths on any frame. Multiple paths per frame, all state through Yjs lenses and awareness atoms, no React state.

**Architecture:** FrameSchema gains a `paths: Record<string, YLinkedList(BezierPointSchema)>` field. AwarenessSchema gains `activePathId: NullOr(String)`. The existing `BezierPath` class (currently in `apps/web`) is copied to `apps/editor` and integrated via a `PathsOverlay` controller that manages `BezierPath` instances per frame. A minimal `Toolbar` component shows Select/Pen buttons. Tool switching via awareness atoms + hotkeys.

**Tech Stack:** effect-yjs (YLinkedList, YDocument, YAwareness), Konva.js, @effect-atom/atom, effect/HashMap, effect/HashSet

---

### Task 1: Extend FrameSchema and AwarenessSchema

**Files:**
- Modify: `packages/core/src/schemas/frame.ts`
- Modify: `packages/core/src/schemas/awareness.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Add BezierPointSchema and paths field to FrameSchema**

```ts
// packages/core/src/schemas/frame.ts
import * as S from "effect/Schema"
import { FrameId } from "./ids"
import { YLinkedList } from "effect-yjs"

export const ContentHash = S.Trimmed.pipe(S.minLength(1), S.brand("ContentHash"))
export type ContentHash = S.Schema.Type<typeof ContentHash>

export const BezierPointSchema = S.Struct({
  x: S.Number,
  y: S.Number,
  handleInAngle: S.Number,
  handleInDistance: S.Number,
  handleOutAngle: S.Number,
  handleOutDistance: S.Number,
})

export type BezierPointData = S.Schema.Type<typeof BezierPointSchema>

export const FrameSchema = S.Struct({
  id: FrameId,
  index: S.Number.pipe(S.int(), S.nonNegative()),
  contentHash: ContentHash,
  width: S.Number.pipe(S.int(), S.positive()),
  height: S.Number.pipe(S.int(), S.positive()),
  paths: S.Record({ key: S.String, value: YLinkedList(BezierPointSchema) }),
})

export type Frame = S.Schema.Type<typeof FrameSchema>

/** Create a BezierPointData with no handles */
export function makePoint(x: number, y: number): BezierPointData {
  return {
    x, y,
    handleInAngle: 0, handleInDistance: 0,
    handleOutAngle: 0, handleOutDistance: 0,
  }
}
```

**Step 2: Add activePathId to AwarenessSchema**

```ts
// packages/core/src/schemas/awareness.ts
import * as S from "effect/Schema"

export const ViewportSchema = S.Struct({
  x: S.Number,
  y: S.Number,
  zoom: S.Number.pipe(S.positive()),
})

export type Viewport = S.Schema.Type<typeof ViewportSchema>

export const AwarenessSchema = S.Struct({
  currentFrame: S.Number.pipe(S.int(), S.nonNegative()),
  activeTool: S.String.pipe(S.minLength(1)),
  activePathId: S.NullOr(S.String),
  selection: S.Array(S.String),
  viewport: ViewportSchema,
})

export type AwarenessState = S.Schema.Type<typeof AwarenessSchema>
```

**Step 3: Export new types from core index**

Add to `packages/core/src/index.ts`:

```ts
export { BezierPointSchema, type BezierPointData, makePoint } from "./schemas/frame"
```

**Step 4: Update awareness initialization in project-doc-atoms.ts**

In `apps/editor/src/lib/project-doc-atoms.ts`, update the awareness `syncSet` call to include `activePathId: null`.

**Step 5: Update import-atoms.ts**

The `importFnAtom` creates frames via `entry.root.focus("frames").focus(id).syncSet(frame)`. The `Frame` type now includes `paths`, so the frame object must include `paths: {}` (empty record). Update the frame construction in `import-atoms.ts`.

**Step 6: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json 2>&1 | head -40`

**Step 7: Commit**

```
feat(core): extend FrameSchema with bezier paths and AwarenessSchema with activePathId
```

---

### Task 2: Copy canvas-objects and coordinate-utils to editor app

The `BezierPath` class, `bezier-math.ts`, `path.ts`, and `coordinate-utils.ts` currently live in `apps/web/src/lib/`. Copy them to the editor app.

**Files:**
- Create: `apps/editor/src/lib/canvas-objects/bezier-curve.ts`
- Create: `apps/editor/src/lib/canvas-objects/bezier-math.ts`
- Create: `apps/editor/src/lib/canvas-objects/path.ts`
- Create: `apps/editor/src/lib/domain/coordinate-utils.ts`

**Step 1: Copy files**

```bash
mkdir -p apps/editor/src/lib/canvas-objects apps/editor/src/lib/domain
cp apps/web/src/lib/canvas-objects/bezier-curve.ts apps/editor/src/lib/canvas-objects/
cp apps/web/src/lib/canvas-objects/bezier-math.ts apps/editor/src/lib/canvas-objects/
cp apps/web/src/lib/canvas-objects/path.ts apps/editor/src/lib/canvas-objects/
cp apps/web/src/lib/domain/coordinate-utils.ts apps/editor/src/lib/domain/
```

**Step 2: Update path.ts to re-export from core**

Since `BezierPointSchema` now lives in `@nur/core`, update `path.ts` to re-export rather than duplicate:

```ts
// apps/editor/src/lib/canvas-objects/path.ts
export { BezierPointSchema, type BezierPointData, makePoint } from "@nur/core"
```

The `PathDocumentSchema` and other test-page-only types are not needed in the editor.

**Step 3: Verify import paths resolve**

The `bezier-curve.ts` imports from `@/lib/domain/coordinate-utils` and `./bezier-math` — these should resolve with the editor's tsconfig `@/` alias. Also imports `type { BezierPointData } from "./path"` which now re-exports from core.

**Step 4: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json 2>&1 | head -40`

**Step 5: Commit**

```
feat(editor): copy bezier canvas-objects and coordinate-utils from web app
```

---

### Task 3: Create path-atoms.ts — tool and path coordination atoms

**Files:**
- Create: `apps/editor/src/lib/path-atoms.ts`

These atoms provide the reactive coordination layer. Path point data is NOT in atoms — it flows through Yjs lenses.

**Step 1: Write path-atoms.ts**

```ts
// apps/editor/src/lib/path-atoms.ts
import { Atom, Result } from "@effect-atom/atom"
import * as HashSet from "effect/HashSet"
import { projectDocRuntime, projectDocEntryAtom, getProjectDoc } from "./project-doc-atoms"
import * as Effect from "effect/Effect"

/** Active tool — read/write from awareness. "select" | "pen" */
export const activeToolAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocEntryAtom(projectId)
  let toolAtom: Atom.Writable<string> | undefined
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    if (!toolAtom) toolAtom = result.value.awareness.local.focus("activeTool").atom()
    return Result.success(get(toolAtom) as string)
  })
})

/** Active path ID — read/write from awareness. null = no path selected */
export const activePathIdAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocEntryAtom(projectId)
  let pathIdAtom: Atom.Writable<string | null> | undefined
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    if (!pathIdAtom) pathIdAtom = result.value.awareness.local.focus("activePathId").atom()
    return Result.success(get(pathIdAtom) as string | null)
  })
})

/** Set active tool — writes to awareness */
export const setActiveToolAtom = Atom.family((projectId: string) =>
  projectDocRuntime.fn(
    Effect.fnUntraced(function* (tool: string, get: Atom.FnContext) {
      const entry = yield* getProjectDoc(projectId)(get as any)
      entry.awareness.local.focus("activeTool").syncSet(tool)
    }),
  ),
)

/** Set active path ID — writes to awareness */
export const setActivePathIdAtom = Atom.family((projectId: string) =>
  projectDocRuntime.fn(
    Effect.fnUntraced(function* (pathId: string | null, get: Atom.FnContext) {
      const entry = yield* getProjectDoc(projectId)(get as any)
      entry.awareness.local.focus("activePathId").syncSet(pathId)
    }),
  ),
)
```

**Note:** `projectDocEntryAtom` must be exported from `project-doc-atoms.ts`. Currently it's module-private. Add `export` to its declaration.

**Step 2: Export projectDocEntryAtom**

In `apps/editor/src/lib/project-doc-atoms.ts`, change:
```ts
const projectDocEntryAtom = Atom.family(...)
```
to:
```ts
export const projectDocEntryAtom = Atom.family(...)
```

**Step 3: Export awareness handle from ProjectDocEntry**

The `ProjectDocEntry` interface stores `awareness` as the return of `createCurrentFrameIndex`, which only exposes `atom`, `get()`, `set()` for the currentFrame number. We need access to the full `YAwarenessHandle` to focus on `activeTool` and `activePathId`.

Add the full awareness handle to the cache entry. In `project-doc-atoms.ts`:

```ts
interface ProjectDocEntry {
  readonly root: ReturnType<typeof createProjectDoc>["root"]
  readonly doc: ReturnType<typeof createProjectDoc>["doc"]
  readonly persistence: ReturnType<typeof createProjectDoc>["persistence"]
  readonly awareness: YAwarenessHandle<AwarenessState>
  readonly currentFrameIndex: ReturnType<typeof createCurrentFrameIndex>
}
```

Update the cache lookup to store both:
```ts
const awareness = YAwareness.make(AwarenessSchema, doc)
// ...
const frameIndex = createCurrentFrameIndex(awareness)
return { root, doc, persistence, awareness, currentFrameIndex: frameIndex }
```

Update `currentFrameAtom` and `setCurrentFrameAtom` to use `entry.currentFrameIndex` instead of `entry.awareness`.

Then in `path-atoms.ts`, access `entry.awareness.local.focus("activeTool")` directly.

**Step 4: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json 2>&1 | head -40`

**Step 5: Commit**

```
feat(editor): add path coordination atoms for tool and active path state
```

---

### Task 4: Create PathsOverlay controller

**Files:**
- Create: `apps/editor/src/lib/canvas-objects/paths-overlay.ts`

The `PathsOverlay` is an imperative controller (not a React component) that manages the lifecycle of `BezierPath` instances for the current frame.

**Step 1: Write paths-overlay.ts**

```ts
// apps/editor/src/lib/canvas-objects/paths-overlay.ts
import Konva from "konva"
import * as MutableHashMap from "effect/MutableHashMap"
import { Registry } from "@effect-atom/atom"
import type { YDocumentRoot } from "effect-yjs"
import type { ProjectDoc } from "@nur/core"
import { BezierPath } from "./bezier-curve"

export class PathsOverlay {
  private readonly layer: Konva.Layer
  private readonly root: YDocumentRoot<ProjectDoc>
  private readonly registry: Registry.Registry
  private readonly paths = MutableHashMap.empty<string, BezierPath>()
  private currentFrameId: string | null = null

  constructor(
    stage: Konva.Stage,
    root: YDocumentRoot<ProjectDoc>,
    registry: Registry.Registry,
  ) {
    this.root = root
    this.registry = registry
    this.layer = new Konva.Layer()
    stage.add(this.layer)
  }

  /** Switch to a new frame — dispose old paths, create new ones */
  setFrame(frameId: string | null): void {
    if (frameId === this.currentFrameId) return
    this.disposeAllPaths()
    this.currentFrameId = frameId
    if (!frameId) return
    this.syncPaths()
  }

  /** Re-sync paths for current frame (call after creating/deleting a path) */
  syncPaths(): void {
    if (!this.currentFrameId) return

    const frameLens = this.root.focus("frames").focus(this.currentFrameId)
    const frameData = frameLens.syncGet()
    if (!frameData) return

    const pathKeys = Object.keys(frameData.paths ?? {})
    const pathKeysSet = new Set(pathKeys)

    // Remove paths that no longer exist
    MutableHashMap.forEach(this.paths, (bp, id) => {
      if (!pathKeysSet.has(id)) {
        bp.dispose()
        MutableHashMap.remove(this.paths, id)
      }
    })

    // Add paths that are new
    for (const pathId of pathKeys) {
      if (MutableHashMap.has(this.paths, pathId)) continue
      const pathLens = frameLens.focus("paths").focus(pathId)
      const bp = new BezierPath(pathLens, this.layer)
      MutableHashMap.set(this.paths, pathId, bp)
    }

    this.layer.batchDraw()
  }

  /** Get a BezierPath instance by ID */
  getPath(pathId: string): BezierPath | undefined {
    const opt = MutableHashMap.get(this.paths, pathId)
    return opt._tag === "Some" ? opt.value : undefined
  }

  /** Create a new path on the current frame, returns the path ID */
  createPath(): string | null {
    if (!this.currentFrameId) return null
    const pathId = crypto.randomUUID()
    // Initialize the path entry in Y.Doc — YLinkedList will be auto-created
    // by effect-yjs when we focus into it
    const frameLens = this.root.focus("frames").focus(this.currentFrameId)
    frameLens.focus("paths").focus(pathId)
    // Sync to pick up the new path
    this.syncPaths()
    return pathId
  }

  /** Get the Konva layer for external click handling */
  getLayer(): Konva.Layer {
    return this.layer
  }

  private disposeAllPaths(): void {
    MutableHashMap.forEach(this.paths, (bp) => bp.dispose())
    MutableHashMap.clear(this.paths)
  }

  dispose(): void {
    this.disposeAllPaths()
    this.layer.destroy()
  }
}
```

**Key design:** `PathsOverlay` does NOT use atoms for path data. It reads/writes through the Y.Doc root lens. The `syncPaths()` method is called imperatively when the frame changes or a new path is created.

**Step 2: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json 2>&1 | head -40`

**Step 3: Commit**

```
feat(editor): add PathsOverlay controller for managing bezier paths per frame
```

---

### Task 5: Create Toolbar component

**Files:**
- Create: `apps/editor/src/components/toolbar.tsx`

**Step 1: Write toolbar.tsx**

```tsx
// apps/editor/src/components/toolbar.tsx
import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import { activeToolAtom, setActiveToolAtom } from "../lib/path-atoms"
import { Button } from "@/components/ui/button"

export function Toolbar({ projectId }: { projectId: string }) {
  const toolResult = useAtomValue(activeToolAtom(projectId))
  const activeTool = Result.isSuccess(toolResult) ? toolResult.value : "select"
  const setTool = useAtomSet(setActiveToolAtom(projectId))

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={activeTool === "select" ? "default" : "ghost"}
        size="sm"
        onClick={() => setTool("select")}
        title="Select (V)"
      >
        <CursorIcon className="h-4 w-4" />
      </Button>
      <Button
        variant={activeTool === "pen" ? "default" : "ghost"}
        size="sm"
        onClick={() => setTool("pen")}
        title="Pen (P)"
      >
        <PenIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
    </svg>
  )
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  )
}
```

**Step 2: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json 2>&1 | head -40`

**Step 3: Commit**

```
feat(editor): add minimal Toolbar component with Select and Pen tool buttons
```

---

### Task 6: Integrate into FrameCanvas and project.$id.tsx

**Files:**
- Modify: `apps/editor/src/components/frame-canvas.tsx`
- Modify: `apps/editor/src/routes/project.$id.tsx`

This is the wiring task. The FrameCanvas gets a ref to its Konva Stage for PathsOverlay to attach to. The project page creates the PathsOverlay, connects it to frame changes, adds click handling, toolbar, and hotkeys.

**Step 1: Update FrameCanvas to expose stage ref**

```tsx
// apps/editor/src/components/frame-canvas.tsx
import { Stage, Layer, Image as KonvaImage } from "react-konva"
import { useFrameImage } from "../hooks/use-frame-image"
import Konva from "konva"
import { forwardRef, useImperativeHandle, useRef } from "react"

export interface FrameCanvasHandle {
  getStage(): Konva.Stage | null
}

export const FrameCanvas = forwardRef<FrameCanvasHandle, {
  contentHash: string | undefined
  width: number
  height: number
  frameWidth: number
  frameHeight: number
}>(function FrameCanvas(props, ref) {
  const stageRef = useRef<Konva.Stage>(null)
  const image = useFrameImage(props.contentHash)

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
  }))

  if (!props.width || !props.height || !props.frameWidth || !props.frameHeight) {
    return null
  }

  const scale = Math.min(
    props.width / props.frameWidth,
    props.height / props.frameHeight
  )
  const scaledW = props.frameWidth * scale
  const scaledH = props.frameHeight * scale
  const offsetX = (props.width - scaledW) / 2
  const offsetY = (props.height - scaledH) / 2

  return (
    <Stage ref={stageRef} width={props.width} height={props.height}>
      <Layer>
        {image && (
          <KonvaImage
            image={image}
            x={offsetX}
            y={offsetY}
            width={scaledW}
            height={scaledH}
          />
        )}
      </Layer>
    </Stage>
  )
})
```

**Step 2: Update project.$id.tsx — add Toolbar, PathsOverlay, click handling, hotkeys**

Key changes to `ProjectEditor`:

```tsx
import { Toolbar } from "../components/toolbar"
import { FrameCanvas, type FrameCanvasHandle } from "../components/frame-canvas"
import { PathsOverlay } from "../lib/canvas-objects/paths-overlay"
import {
  activeToolAtom,
  activePathIdAtom,
  setActiveToolAtom,
  setActivePathIdAtom,
} from "../lib/path-atoms"
import { getProjectDoc, projectDocEntryAtom } from "../lib/project-doc-atoms"
import { appRegistry, syncGet } from "../lib/atom-registry"

// Inside ProjectEditor:

// Get the Y.Doc root for PathsOverlay (from cache entry)
const entryResult = useAtomValue(projectDocEntryAtom(id))
const entry = entryResult._tag === "Success" ? entryResult.value : null

// Refs
const canvasRef = useRef<FrameCanvasHandle>(null)
const overlayRef = useRef<PathsOverlay | null>(null)

// Tool state
const toolResult = useAtomValue(activeToolAtom(id))
const activeTool = Result.isSuccess(toolResult) ? toolResult.value : "select"
const setTool = useAtomSet(setActiveToolAtom(id))
const setActivePathId = useAtomSet(setActivePathIdAtom(id))

// Initialize PathsOverlay when stage and entry are ready
const overlayAtom = Atom.make((get) => {
  if (!entry) return
  const stage = canvasRef.current?.getStage()
  if (!stage) return

  const overlay = new PathsOverlay(stage, entry.root, appRegistry)
  overlayRef.current = overlay

  // Set initial frame
  const frameId = currentFrameData?.id ?? null
  overlay.setFrame(frameId)

  get.addFinalizer(() => {
    overlay.dispose()
    overlayRef.current = null
  })
})
useAtomMount(overlayAtom)

// Update overlay when frame changes
// (use an effect atom or call overlay.setFrame in a separate mount atom)

// Stage click handler for pen tool
const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
  if (activeTool !== "pen") return
  const stage = canvasRef.current?.getStage()
  if (!stage) return
  const pos = stage.getPointerPosition()
  if (!pos) return

  const overlay = overlayRef.current
  if (!overlay) return

  // Get or create active path
  const pathIdResult = useAtomValue(activePathIdAtom(id))
  const activePathId = Result.isSuccess(pathIdResult) ? pathIdResult.value : null

  let pathId = activePathId
  if (!pathId) {
    pathId = overlay.createPath()
    if (!pathId) return
    setActivePathId(pathId)
  }

  const bp = overlay.getPath(pathId)
  if (bp) {
    bp.appendPoint(pos.x, pos.y)
  }
}, [activeTool, id, setActivePathId])

// Add hotkeys for V (select) and P (pen)
const hotkeyAtom = Atom.make((get) => {
  registerHotkeyContext({
    id: "editor",
    bindings: [
      { key: "ArrowRight", handler: () => triggerSetFrame(Math.min(currentFrame + 1, frameCount - 1)) },
      { key: "ArrowLeft", handler: () => triggerSetFrame(Math.max(currentFrame - 1, 0)) },
      { key: "v", handler: () => setTool("select") },
      { key: "p", handler: () => setTool("pen") },
    ],
  })
  get.addFinalizer(() => unregisterHotkeyContext("editor"))
})

// Add Toolbar to header
<header className="flex items-center gap-4 px-4 py-2 border-b border-border">
  <Button variant="link" asChild><Link to="/">Back</Link></Button>
  <Toolbar projectId={id} />
  <h1 className="text-lg font-semibold">{name || "Untitled"}</h1>
  ...
</header>
```

**Important:** The stage click handler needs to be wired to the Konva Stage. Since `FrameCanvas` uses react-konva's `<Stage>`, the click handler should be passed as a prop or attached via the ref. The simplest approach is to add an `onStageClick` prop to FrameCanvas that attaches to the Stage's `onClick`.

**Step 3: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json 2>&1 | head -40`

**Step 4: Commit**

```
feat(editor): integrate PathsOverlay, Toolbar, and pen tool into project editor
```

---

### Task 7: Final verification and smoke test

**Step 1: Run ESLint**

Run: `cd apps/editor && npx eslint src/ 2>&1 | head -40`

**Step 2: Run typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json`

**Step 3: Manual smoke test**

Open the app, navigate to a project with frames:
1. Verify toolbar shows Select (highlighted) and Pen buttons
2. Click Pen button — highlight switches
3. Press V — switches back to Select
4. Press P — switches to Pen
5. With Pen active, click on canvas — creates first point
6. Click again — creates second point, line appears between them
7. Click on the path line — inserts point via de Casteljau
8. Drag a point — position updates
9. Drag a handle — curve updates
10. Switch frames — old paths disappear, new frame shows its paths
11. Switch back — original paths reappear (persisted in Y.Doc)

**Step 4: Commit any fixes**

```
chore(editor): verify bezier tool integration
```
