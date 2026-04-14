# Canvas-Atom Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Break the monolithic `canvas-atom.ts` into focused concerns — PathRenderer/PathEditor self-subscribe to zoom and active layer, a reactive `visibleMasksAtom` replaces the imperative `syncPaths` sledgehammer, and pen tool interaction moves to `@nur/pen-tool`.

**Architecture:** `PathRenderer` receives `appRegistry` and self-subscribes to `zoomAtom` (for scale compensation) and `activeLayerIdAtom` (for fill opacity). `PathEditor` self-subscribes to `zoomAtom`. A new `visibleMasksAtom` derived atom computes which `(layerId, frameId, maskId)` tuples should be visible, and `canvas-atom.ts` diffs against existing renderers — only creating/disposing what changed. The pen tool's pointer handlers and drawing state move to `@nur/pen-tool` as an `attachPenTool()` function.

**Tech Stack:** TypeScript, Konva.js, effect-atom (`Registry`, `Atom`, `Result`), effect-yjs (`YLinkedListLens`), Effect `HashMap`/`HashSet`.

---

### Task 1: PathRenderer self-subscribes to `zoomAtom` and `activeLayerIdAtom`

**Files:**
- Modify: `apps/editor/src/lib/canvas-objects/path-renderer.ts`

**Context:**
Currently `PathRenderer` receives `fillOpacity` as a static option and `updateScale(zoom)` is called externally by `canvas-atom.ts`. After this task, `PathRenderer` receives `appRegistry` + `layerId` and subscribes to both atoms internally. `updateScale` and `setFillOpacity` become private. The `fillOpacity` option is removed from `PathRendererOptions`.

**Step 1: Update `PathRendererOptions` and constructor signature**

Replace the current options interface and add new fields:

```typescript
import type { Registry } from "@effect-atom/atom"

export interface PathRendererOptions {
  appRegistry: Registry.Registry      // NEW — for subscribing to app atoms
  layerId: string                     // NEW — to compare against activeLayerIdAtom
  onSelect?: () => void
  color?: string
  outerLens?: YLinkedListLens<BezierPointData>
  bufferDistance?: number
  outerMode?: "uniform" | "free"
  onBufferChange?: (distance: number) => void
  maskLens?: any
}
```

Remove `fillOpacity` from the options — it will be derived.

**Step 2: Add app-level subscriptions in the constructor**

After the existing `this.startMaskFieldSubscriptions(options?.maskLens)` call, add:

```typescript
    // Self-subscribe to zoom
    if (options?.appRegistry) {
      this.startAppSubscriptions(options.appRegistry, options.layerId)
    }
```

Add the new private method and required imports:

```typescript
import { activeLayerIdAtom } from "../layer-atoms"
import { zoomAtom } from "../viewport-atoms"
import { Result } from "@effect-atom/atom"

  private unsubscribeApp: (() => void) | null = null
  private readonly layerId: string

  private startAppSubscriptions(appRegistry: Registry.Registry, layerId: string): void {
    const unsub1 = appRegistry.subscribe(zoomAtom, (zoomResult) => {
      const zoom = Result.isSuccess(zoomResult) ? zoomResult.value as number : 1
      this.updateScale(zoom)
    }, { immediate: true })

    const unsub2 = appRegistry.subscribe(activeLayerIdAtom, (result) => {
      const activeId = Result.isSuccess(result) ? result.value as string | null : null
      if (activeId === null) {
        this.setFillOpacity(0.25)      // viewing mode — no layer selected
      } else if (activeId === this.layerId) {
        this.setFillOpacity(0.35)      // active layer
      } else {
        this.setFillOpacity(0.15)      // other layer
      }
    }, { immediate: true })

    this.unsubscribeApp = () => { unsub1(); unsub2() }
  }
```

**Step 3: Store `layerId` in constructor**

In the constructor body, before existing option reads:

```typescript
    this.layerId = options?.layerId ?? ""
```

**Step 4: Update `dispose()` to clean up app subscriptions**

Add before existing cleanup:

```typescript
    this.unsubscribeApp?.()
```

**Step 5: Make `updateScale` and `setFillOpacity` private**

Change both method signatures from:
```typescript
  updateScale(zoom: number): void {
  setFillOpacity(opacity: number): void {
```
To:
```typescript
  private updateScale(zoom: number): void {
  private setFillOpacity(opacity: number): void {
```

**Step 6: Verify TypeScript compiles**

```bash
pnpm --filter @nur/editor exec tsc --noEmit 2>&1 | head -30
```
Expected: errors in `canvas-atom.ts` where it calls `renderer.updateScale(zoom)` and `renderer.setFillOpacity(...)` — those calls are now illegal. This is expected and will be fixed in Task 4.

For now, to get a clean compile, temporarily keep `updateScale` public by not changing its visibility yet. Change it to private in Task 4 after canvas-atom stops calling it.

**Step 7: Commit**
```bash
git add apps/editor/src/lib/canvas-objects/path-renderer.ts
git commit -m "feat: PathRenderer self-subscribes to zoomAtom and activeLayerIdAtom"
```

---

### Task 2: PathEditor self-subscribes to `zoomAtom`

**Files:**
- Modify: `apps/editor/src/lib/canvas-objects/path-editor.ts`

**Context:**
Currently `PathEditor` receives `updateScale(zoom)` calls from `canvas-atom.ts`. After this task it subscribes to `zoomAtom` via `appRegistry` directly. The `updateScale` method becomes private.

**Step 1: Update `PathEditorOptions` and constructor**

```typescript
export interface PathEditorOptions {
  appRegistry: Registry.Registry    // NEW
  onBufferChange?: (distance: number) => void
}
```

**Step 2: Add zoom subscription in the constructor**

After `this.startGhostHandlers()`, add:

```typescript
    if (options?.appRegistry) {
      this.startAppSubscriptions(options.appRegistry)
    }
```

Add the method:

```typescript
import { zoomAtom } from "../viewport-atoms"
import { Result } from "@effect-atom/atom"

  private unsubscribeApp: (() => void) | null = null

  private startAppSubscriptions(appRegistry: Registry.Registry): void {
    this.unsubscribeApp = appRegistry.subscribe(zoomAtom, (zoomResult) => {
      const zoom = Result.isSuccess(zoomResult) ? zoomResult.value as number : 1
      this.updateScale(zoom)
    }, { immediate: true })
  }
```

**Step 3: Update `dispose()` to clean up**

Add before existing cleanup:

```typescript
    this.unsubscribeApp?.()
```

**Step 4: Keep `updateScale` public for now**

It will be made private in Task 4 when canvas-atom stops calling it.

**Step 5: Verify TypeScript compiles**

```bash
pnpm --filter @nur/editor exec tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors (canvas-atom still calls `updateScale` but it's still public).

**Step 6: Commit**
```bash
git add apps/editor/src/lib/canvas-objects/path-editor.ts
git commit -m "feat: PathEditor self-subscribes to zoomAtom"
```

---

### Task 3: Create `visibleMasksAtom` — reactive mask set

**Files:**
- Create: `apps/editor/src/lib/visible-masks-atom.ts`

**Context:**
This is the reactive replacement for `syncPaths`. It derives the set of visible mask specs from `currentFrameAtom` + `framesAtom` + `layersAtom` (Y.Doc reactive). The output is a `Record<pathKey, MaskSpec>` describing every mask that should have a `PathRenderer` on the canvas. `canvas-atom.ts` will subscribe to this and diff against its existing renderers.

**Step 1: Create the atom file**

```typescript
// apps/editor/src/lib/visible-masks-atom.ts
import { Atom, Result } from "@effect-atom/atom"
import { activeEntryAtom, currentFrameAtom, framesAtom } from "./project-doc-atoms"
import { layersAtom } from "./layer-atoms"
import type { Frame, Layer } from "@nur/core"

export interface MaskSpec {
  pathKey: string
  layerId: string
  frameId: string
  maskId: string
  color: string
}

/**
 * Derived atom: computes which masks should be visible on the canvas.
 * Fires when frame changes, layers change, or masks are added/removed.
 */
export const visibleMasksAtom = Atom.make((get): Result.Result<Record<string, MaskSpec>> => {
  const entryResult = get(activeEntryAtom)
  if (!Result.isSuccess(entryResult)) return entryResult as unknown as Result.Result<Record<string, MaskSpec>>
  const { root } = entryResult.value

  const framesResult = get(framesAtom)
  if (!Result.isSuccess(framesResult)) return framesResult as unknown as Result.Result<Record<string, MaskSpec>>
  const frames = framesResult.value as Frame[]

  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(currentResult)) return currentResult as unknown as Result.Result<Record<string, MaskSpec>>
  const currentIdx = currentResult.value as number
  const frame = frames[currentIdx]
  if (!frame) return Result.success({})

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return layersResult as unknown as Result.Result<Record<string, MaskSpec>>
  const layers = layersResult.value as Array<Layer & { id: string }>

  const specs: Record<string, MaskSpec> = {}

  for (const layer of layers) {
    const layerData = layer as any
    const masks = layerData.masks ?? {}
    const frameMasks = masks[frame.id]
    if (!frameMasks || typeof frameMasks !== "object") continue

    for (const maskId of Object.keys(frameMasks)) {
      const pathKey = `${layer.id}:${frame.id}:${maskId}`
      specs[pathKey] = {
        pathKey,
        layerId: layer.id,
        frameId: frame.id,
        maskId,
        color: layerData.color ?? "#888",
      }
    }
  }

  return Result.success(specs)
})
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @nur/editor exec tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

**Step 3: Commit**
```bash
git add apps/editor/src/lib/visible-masks-atom.ts
git commit -m "feat: add visibleMasksAtom — reactive mask set derived from Y.Doc"
```

---

### Task 4: Update `canvas-atom.ts` to use `visibleMasksAtom` and remove imperative orchestration

**Files:**
- Modify: `apps/editor/src/lib/canvas-atom.ts`
- Modify: `apps/editor/src/lib/canvas-objects/path-renderer.ts` (make `updateScale` private)
- Modify: `apps/editor/src/lib/canvas-objects/path-editor.ts` (make `updateScale` private)

**Context:**
This is the core refactor. Replace `syncPaths`/`syncLayerPaths`/`syncAllLayerPaths` with a reactive diff subscription to `visibleMasksAtom`. Remove the zoom forEach loop. Remove the `activeLayerIdAtom` and `currentFrameMaskCountAtom` subscriptions. Remove `getLayerMasksRecord`, `getFrameMasks`, `disposeAllPaths` helpers (replaced by diff logic). Pass `appRegistry` to `PathRenderer` and `PathEditor` constructors.

**Step 1: Add import for `visibleMasksAtom`**

```typescript
import { visibleMasksAtom, type MaskSpec } from "./visible-masks-atom"
```

**Step 2: Replace `syncPaths`/`syncLayerPaths`/`syncAllLayerPaths`/`getLayerMasksRecord`/`getFrameMasks` with a diff function**

Delete all of:
- `disposeAllPaths()` (lines ~141-146)
- `getActiveLayerId()` (lines ~148-151)
- `syncPaths()` (lines ~153-173)
- `getLayerMasksRecord()` (lines ~175-182)
- `getFrameMasks()` (lines ~184-188)
- `syncAllLayerPaths()` (lines ~190-219)
- `syncLayerPaths()` (lines ~221-278)

Replace with:

```typescript
  function getActiveLayerId(): string | null {
    const result = appRegistry.get(activeLayerIdAtom) as any
    return result?._tag === "Success" ? result.value : null
  }

  /** Diff visible masks — create/dispose renderers as needed */
  function diffRenderers(specs: Record<string, MaskSpec>) {
    // Remove renderers for masks that no longer exist
    const toRemove: string[] = []
    MutableHashMap.forEach(paths, (_renderer, key) => {
      if (!(key in specs)) toRemove.push(key)
    })
    for (const key of toRemove) {
      const renderer = MutableHashMap.get(paths, key)
      if (renderer._tag === "Some") {
        // If this renderer's editor is active, dispose it
        if (activeEditor && activeEditorPathKey === key) {
          activeEditor.dispose()
          activeEditor = null
          activeEditorPathKey = null
        }
        renderer.value.dispose()
      }
      MutableHashMap.remove(paths, key)
    }

    // Add renderers for new masks
    for (const [key, spec] of Object.entries(specs)) {
      if (MutableHashMap.has(paths, key)) continue

      const maskLens = (root.focus("layers").focus(spec.layerId) as any)
        .focus("masks").focus(spec.frameId).focus(spec.maskId)
      const innerLens = maskLens.focus("inner")
      const outerLens = maskLens.focus("outer")
      const maskData = maskLens.syncGet()

      const renderer = new PathRenderer(innerLens, pathsLayer, {
        appRegistry,
        layerId: spec.layerId,
        onSelect: () => appRegistry.set(activePathIdRawAtom, key),
        color: spec.color,
        outerLens,
        bufferDistance: maskData?.bufferDistance ?? 20,
        outerMode: maskData?.outerMode ?? "uniform",
        onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
        maskLens,
      })
      MutableHashMap.set(paths, key, renderer)
    }

    pathsLayer.batchDraw()
    handlesLayer.batchDraw()
  }
```

**Step 3: Update state variables**

Add alongside existing `let activeEditor`:

```typescript
  let activeEditorPathKey: string | null = null
```

**Step 4: Replace frame/layer/mask-count subscriptions**

Delete these subscription blocks:
- `get.subscribe(framesAtom, ...)` — frames changes are covered by visibleMasksAtom
- `get.subscribe(currentFrameAtom, ...)` — same
- `get.subscribe(activeLayerIdAtom, ...)` — renderers self-subscribe now
- `get.subscribe(currentFrameMaskCountAtom, ...)` — covered by visibleMasksAtom

Replace with a single `visibleMasksAtom` subscription:

```typescript
  // -- React to visible mask set changes --
  get.subscribe(visibleMasksAtom, (result) => {
    if (!Result.isSuccess(result)) return
    diffRenderers(result.value)
    redrawRulers()
  })
```

Keep the frame-change logic for **image loading** only — `currentFrameAtom` still needs to trigger `subscribeToFrameImage`. Add a lightweight subscription:

```typescript
  get.subscribe(currentFrameAtom, (currentResult) => {
    const currentIdx = currentResult._tag === "Success" ? currentResult.value : 0
    const rawFramesNow = (root.focus("frames").syncGet() ?? {}) as Record<string, Frame>
    const frames = Object.values(rawFramesNow).sort((a, b) => a.index - b.index)
    const frameData = frames.find((f) => f.index === currentIdx)
    if (frameData) {
      currentFrameWidth = frameData.width
      currentFrameHeight = frameData.height
      subscribeToFrameImage(frameData.contentHash)
    } else {
      subscribeToFrameImage(undefined)
    }
    updateImageTransform()
  })
```

Delete the `applyFrame` function entirely — its responsibilities are split between the `visibleMasksAtom` subscription (mask lifecycle) and the `currentFrameAtom` subscription above (image loading).

Update the initial setup block (currently calls `applyFrame`) to:

```typescript
  // -- Initial setup --
  const initialCurrentIdx = (() => {
    const result = appRegistry.get(currentFrameAtom) as any
    return result?._tag === "Success" ? result.value : 0
  })()
  const initialFrame = initialFrames[initialCurrentIdx] ?? initialFrames[0]
  if (initialFrame) {
    currentFrameWidth = initialFrame.width
    currentFrameHeight = initialFrame.height
    subscribeToFrameImage(initialFrame.contentHash)
  }
  updateImageTransform()
```

The initial `diffRenderers` call happens automatically via the `visibleMasksAtom` subscription with `{ immediate: true }` — wait, effect-atom subscriptions don't fire immediately by default. Check: if `get.subscribe` does NOT fire immediately, add an explicit initial call:

```typescript
  const initialMasks = appRegistry.get(visibleMasksAtom) as any
  if (initialMasks?._tag === "Success") diffRenderers(initialMasks.value)
```

**Step 5: Update `activePathIdAtom` subscription**

Track `activeEditorPathKey`:

```typescript
  get.subscribe(activePathIdAtom, (pathIdResult) => {
    const activePathId = pathIdResult._tag === "Success" ? pathIdResult.value : null
    activeEditor?.dispose()
    activeEditor = null
    activeEditorPathKey = null
    if (activePathId) {
      const rendererOption = MutableHashMap.get(paths, activePathId)
      if (rendererOption._tag === "Some") {
        activeEditor = new PathEditor(rendererOption.value, handlesLayer, {
          appRegistry,
          onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
        })
        activeEditorPathKey = activePathId
      }
    }
    handlesLayer.batchDraw()
  })
```

Remove `activeEditor.updateScale(getCurrentZoom())` — the editor self-subscribes now.

**Step 6: Simplify zoom subscription**

Remove the `MutableHashMap.forEach(paths, ...)` and `activeEditor?.updateScale(zoom)` lines. The zoom subscription now only handles the stage transform:

```typescript
  get.subscribe(zoomAtom, (zoomResult) => {
    const zoom = zoomResult._tag === "Success" ? zoomResult.value : 1
    const stageW = stage.width()
    const stageH = stage.height()
    stage.scale({ x: zoom, y: zoom })
    stage.offset({
      x: (stageW / 2) * (1 - 1 / zoom),
      y: (stageH / 2) * (1 - 1 / zoom),
    })
    appRegistry.set(stagePositionAtom, { x: stage.x(), y: stage.y() })
    updateImageTransform()
    stage.batchDraw()
  })
```

**Step 7: Remove `getCurrentZoom` helper**

No longer used by canvas-atom (renderers/editors subscribe themselves). Delete it.

**Step 8: Update cleanup finalizer**

```typescript
  get.addFinalizer(() => {
    log.info("destroying Konva stage")
    container.removeEventListener("wheel", handleWheel)
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("keyup", handleKeyUp)
    container.removeEventListener("mousedown", handlePanStart)
    window.removeEventListener("mousemove", handlePanMove)
    window.removeEventListener("mouseup", handlePanEnd)
    imageUnsubscribe?.()
    activeEditor?.dispose()
    activeEditor = null
    MutableHashMap.forEach(paths, (renderer) => renderer.dispose())
    MutableHashMap.clear(paths)
    resizeObserver.disconnect()
    stage.destroy()
  })
```

**Step 9: Remove unused imports**

Remove from imports:
- `currentFrameMaskCountAtom` (from layer-atoms import)
- `framesAtom` (no longer subscribed to directly — still used? Check: `framesAtom` was used in the old `get.subscribe(framesAtom, ...)` block. Remove if no longer referenced.)

Keep `activeLayerIdAtom` — still used in `getActiveLayerId()` for the pen tool.

**Step 10: Make `updateScale` private in both PathRenderer and PathEditor**

In `path-renderer.ts`, change:
```typescript
  updateScale(zoom: number): void {
```
to:
```typescript
  private updateScale(zoom: number): void {
```

In `path-editor.ts`, same change.

**Step 11: Verify TypeScript compiles**

```bash
pnpm --filter @nur/editor exec tsc --noEmit 2>&1 | head -30
```
Expected: 0 errors.

**Step 12: Commit**
```bash
git add apps/editor/src/lib/canvas-atom.ts apps/editor/src/lib/canvas-objects/path-renderer.ts apps/editor/src/lib/canvas-objects/path-editor.ts
git commit -m "refactor: canvas-atom uses visibleMasksAtom, removes syncPaths"
```

---

### Task 5: Extract pen tool to `@nur/pen-tool`

**Files:**
- Create: `packages/pen-tool/src/index.ts`
- Create: `packages/pen-tool/src/attach-pen-tool.ts`
- Modify: `apps/editor/src/lib/canvas-atom.ts` (remove pen tool code, call `attachPenTool`)
- Modify: `apps/editor/package.json` (add `@nur/pen-tool` dependency)

**Context:**
Move the pen tool pointer handlers (pointerdown/pointermove/pointerup on stage) and their closure state (`dragOrigin`, `newPointId`, `activeMaskId`, `isDraggingNewHandle`, `DRAG_THRESHOLD`) from `canvas-atom.ts` into `@nur/pen-tool`. The function receives a context object and returns a dispose function.

**Step 1: Create `attach-pen-tool.ts`**

```typescript
// packages/pen-tool/src/attach-pen-tool.ts
import type Konva from "konva"
import type { Registry } from "@effect-atom/atom"
import type { YLinkedListLens } from "effect-yjs"

export interface PenToolContext {
  stage: Konva.Stage
  pathsLayer: Konva.Layer
  handlesLayer: Konva.Layer
  root: any                               // YDocument root lens
  appRegistry: Registry.Registry
  /** Atoms read imperatively by the pen tool */
  atoms: {
    activeToolAtom: any
    drawingStateAtom: any
    activeLayerIdAtom: any
    zoomAtom: any
    activePathIdRawAtom: any
    setBufferDistanceAtom: any
  }
  /** Machine actor for sending ClosePath event */
  canvasActor: { sendSync: (event: any) => void } | null
  canvasEvent: { ClosePath: any }
  /** Callback when a new mask is created — so canvas-atom can track the renderer */
  onMaskCreated: (pathKey: string, renderer: any, editor: any) => void
  /** Callback to get the current active editor */
  getActiveEditor: () => any
  /** Factory to create PathRenderer + PathEditor for a new mask */
  createPathRenderer: (innerLens: any, opts: any) => any
  createPathEditor: (renderer: any) => any
}

export function attachPenTool(ctx: PenToolContext): () => void {
  let dragOrigin: { x: number; y: number } | null = null
  let newPointId: string | null = null
  let activeMaskId: string | null = null
  let isDraggingNewHandle = false
  const DRAG_THRESHOLD = 3

  function getStagePointerPosition(): { x: number; y: number } | null {
    const pos = ctx.stage.getPointerPosition()
    if (!pos) return null
    const transform = ctx.stage.getAbsoluteTransform().copy().invert()
    return transform.point(pos)
  }

  function getAtomValue(atom: any): any {
    const result = ctx.appRegistry.get(atom) as any
    return result?._tag === "Success" ? result.value : null
  }

  function getCurrentZoom(): number {
    return getAtomValue(ctx.atoms.zoomAtom) ?? 1
  }

  const onPointerDown = () => {
    const tool = getAtomValue(ctx.atoms.activeToolAtom)
    if (tool !== "pen") return

    const drawingState = getAtomValue(ctx.atoms.drawingStateAtom)
    if (drawingState !== "drawing") return

    const activeLayerId = getAtomValue(ctx.atoms.activeLayerIdAtom)
    if (!activeLayerId) return

    const currentFrameId = ctx.stage.getAttr("currentFrameId") as string | undefined
    // Read currentFrameId from the shared state — pen tool needs it passed in
    // For now use the root lens to figure it out
    // Actually: we'll pass it via stage attr or a getter

    const pos = getStagePointerPosition()
    if (!pos) return

    const activeEditor = ctx.getActiveEditor()

    // Reuse active mask if one exists
    if (!activeMaskId || !activeEditor) {
      const layerData = (ctx.root.focus("layers").focus(activeLayerId) as any).syncGet()
      const frameMasksLens = (ctx.root.focus("layers").focus(activeLayerId) as any).focus("masks").focus(currentFrameId!)
      const existingFrameMasks = frameMasksLens.syncGet()
      if (!existingFrameMasks) {
        ;(frameMasksLens as any).syncSet({})
      }
      activeMaskId = crypto.randomUUID()
      const maskLens = frameMasksLens.focus(activeMaskId)
      ;(maskLens as any).syncSet({
        name: null,
        inner: [],
        outer: [],
        bufferDistance: 20,
        outerMode: "uniform",
      })

      const pathKey = `${activeLayerId}:${currentFrameId}:${activeMaskId}`
      const innerLens = maskLens.focus("inner")
      const outerLens = maskLens.focus("outer")

      const renderer = ctx.createPathRenderer(innerLens, {
        color: layerData?.color,
        outerLens,
        bufferDistance: 20,
        outerMode: "uniform",
        maskLens,
        onSelect: () => ctx.appRegistry.set(ctx.atoms.activePathIdRawAtom, pathKey),
      })
      const editor = ctx.createPathEditor(renderer)

      ctx.onMaskCreated(pathKey, renderer, editor)
      ctx.appRegistry.set(ctx.atoms.activePathIdRawAtom, pathKey)
      ctx.pathsLayer.moveToTop()
      ctx.handlesLayer.moveToTop()
    }

    const editor = ctx.getActiveEditor()
    if (!editor) return

    // Check close-ready
    const points = editor.getPoints()
    const currentZoom = getCurrentZoom()
    const closeThreshold = Math.max(10, 15 / currentZoom)
    if (points.length >= 3) {
      const first = points[0]
      const dx = pos.x - first.x
      const dy = pos.y - first.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < closeThreshold) {
        editor.appendPoint(first.x, first.y)
        activeMaskId = null
        ctx.canvasActor?.sendSync(ctx.canvasEvent.ClosePath)
        return
      }
    }

    // Skip if near existing point
    if (points.length > 0) {
      const nearExisting = points.some((pt: any) => {
        const dx = pos.x - pt.x
        const dy = pos.y - pt.y
        return Math.sqrt(dx * dx + dy * dy) < 8
      })
      if (nearExisting) return
    }

    const id = editor.appendPoint(pos.x, pos.y)
    dragOrigin = { x: pos.x, y: pos.y }
    newPointId = id
    isDraggingNewHandle = false
  }

  const onPointerMove = () => {
    if (!dragOrigin || !newPointId) return
    const pos = getStagePointerPosition()
    if (!pos) return
    const dx = pos.x - dragOrigin.x
    const dy = pos.y - dragOrigin.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (!isDraggingNewHandle && dist < DRAG_THRESHOLD) return
    isDraggingNewHandle = true

    const activeLayerId = getAtomValue(ctx.atoms.activeLayerIdAtom)
    if (!activeLayerId || !activeMaskId) return

    const currentFrameId = ctx.stage.getAttr("currentFrameId") as string | undefined
    if (!currentFrameId) return

    const maskLens = (ctx.root.focus("layers").focus(activeLayerId) as any)
      .focus("masks").focus(currentFrameId).focus(activeMaskId)
    const innerLens = maskLens.focus("inner")
    const nodeLens = innerLens.find(newPointId)

    const angle = Math.atan2(dy, dx)
    nodeLens.focus("handleOutAngle").syncSet(angle)
    nodeLens.focus("handleOutDistance").syncSet(dist)
    nodeLens.focus("handleInAngle").syncSet(angle + Math.PI)
    nodeLens.focus("handleInDistance").syncSet(dist)
  }

  const onPointerUp = () => {
    dragOrigin = null
    newPointId = null
    isDraggingNewHandle = false
  }

  // Reset activeMaskId when drawing ends
  const unsubDrawing = ctx.appRegistry.subscribe(ctx.atoms.drawingStateAtom, (result: any) => {
    const state = result?._tag === "Success" ? result.value : "idle"
    if (state === "idle") {
      activeMaskId = null
    }
  })

  ctx.stage.on("pointerdown.pentool", onPointerDown)
  ctx.stage.on("pointermove.pentool", onPointerMove)
  ctx.stage.on("pointerup.pentool", onPointerUp)

  return () => {
    ctx.stage.off("pointerdown.pentool")
    ctx.stage.off("pointermove.pentool")
    ctx.stage.off("pointerup.pentool")
    unsubDrawing()
  }
}
```

**Step 2: Update the package index**

```typescript
// packages/pen-tool/src/index.ts
export { attachPenTool, type PenToolContext } from "./attach-pen-tool"
```

**Step 3: Add `@nur/pen-tool` dependency to editor**

In `apps/editor/package.json`, add to `dependencies`:
```json
"@nur/pen-tool": "workspace:*"
```

Run:
```bash
pnpm install
```

**Step 4: Update `canvas-atom.ts` — remove inline pen tool, call `attachPenTool`**

Delete the entire `stage.on("pointerdown", ...)`, `stage.on("pointermove", ...)`, `stage.on("pointerup", ...)` blocks and their closure state variables (`dragOrigin`, `newPointId`, `activeMaskId`, `isDraggingNewHandle`, `DRAG_THRESHOLD`).

Delete the `drawingStateAtom` subscription (the pen tool handles it internally).

Add import and hookup:

```typescript
import { attachPenTool } from "@nur/pen-tool"
```

After the subscriptions section, add:

```typescript
  // -- Pen tool --
  const disposePenTool = attachPenTool({
    stage,
    pathsLayer,
    handlesLayer,
    root,
    appRegistry,
    atoms: {
      activeToolAtom,
      drawingStateAtom,
      activeLayerIdAtom,
      zoomAtom,
      activePathIdRawAtom,
      setBufferDistanceAtom,
    },
    canvasActor,
    canvasEvent: CanvasEvent,
    getActiveEditor: () => activeEditor,
    onMaskCreated: (pathKey, renderer, editor) => {
      MutableHashMap.set(paths, pathKey, renderer)
      activeEditor?.dispose()
      activeEditor = editor
      activeEditorPathKey = pathKey
    },
    createPathRenderer: (innerLens, opts) => {
      return new PathRenderer(innerLens, pathsLayer, {
        ...opts,
        appRegistry,
        layerId: getActiveLayerId()!,
      })
    },
    createPathEditor: (renderer) => {
      return new PathEditor(renderer, handlesLayer, {
        appRegistry,
        onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
      })
    },
  })
```

Add to finalizer:
```typescript
    disposePenTool()
```

The pen tool needs `currentFrameId`. Rather than passing it via stage attr, pass a getter:

Add to `PenToolContext`:
```typescript
  getCurrentFrameId: () => string | null
```

And pass:
```typescript
  getCurrentFrameId: () => currentFrameId,
```

Update `attach-pen-tool.ts` to use `ctx.getCurrentFrameId()` instead of `ctx.stage.getAttr("currentFrameId")`.

**Step 5: Remove unused imports from canvas-atom.ts**

Remove `drawingStateAtom` from path-atoms import (if no longer used).
Remove `activeToolAtom` from path-atoms import (passed through, but still imported — keep if used elsewhere).

**Step 6: Verify TypeScript compiles**

```bash
pnpm --filter @nur/editor exec tsc --noEmit 2>&1 | head -30
```
Expected: 0 errors.

**Step 7: Commit**
```bash
git add packages/pen-tool/src/ apps/editor/src/lib/canvas-atom.ts apps/editor/package.json pnpm-lock.yaml
git commit -m "refactor: extract pen tool to @nur/pen-tool package"
```

---

### Task 6: Remove `currentFrameMaskCountAtom` import and subscription

**Files:**
- Modify: `apps/editor/src/lib/canvas-atom.ts`

**Context:**
After Task 4, `currentFrameMaskCountAtom` is no longer needed in canvas-atom — `visibleMasksAtom` covers mask count changes reactively. If any other file still imports `currentFrameMaskCountAtom` from `layer-atoms.ts`, the atom itself stays. Just clean the import from canvas-atom.

**Step 1: Remove from import**

```typescript
// Before:
import { activeLayerIdAtom, currentFrameMaskCountAtom, editingPathTargetAtom, setBufferDistanceAtom } from "./layer-atoms"
// After:
import { activeLayerIdAtom, editingPathTargetAtom, setBufferDistanceAtom } from "./layer-atoms"
```

**Step 2: Verify no remaining references**

```bash
grep "currentFrameMaskCountAtom" apps/editor/src/lib/canvas-atom.ts
```
Expected: no output.

**Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @nur/editor exec tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**
```bash
git add apps/editor/src/lib/canvas-atom.ts
git commit -m "chore: remove unused currentFrameMaskCountAtom import from canvas-atom"
```

---

### Task 7: Smoke test

**No code changes — manual verification.**

**Scenarios to test:**

| Scenario | Expected |
|----------|----------|
| Open project, no layer selected | All masks visible with 0.25 opacity |
| Select a layer | Active layer masks brighten (0.35), others dim (0.15) |
| Switch between layers | Opacities update without full rebuild |
| Navigate between frames | Masks change, image changes |
| Draw new mask with pen tool | Points appear, drag creates handles |
| Close path | Outer path computed, fill appears |
| Copy from previous | New masks appear without full rebuild |
| Click mask fill → select | Editor handles appear |
| Zoom in/out | Handles + strokes scale correctly |
| Pan (space+drag) | Canvas pans |
| Reset view | Canvas recenters |
