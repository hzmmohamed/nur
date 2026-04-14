# PathRenderer / PathEditor Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monolithic `BezierPath` class with two focused classes — `PathRenderer` (fill/stroke, always present per mask) and `PathEditor` (interactive handles, one instance at a time) — and a dedicated `handlesLayer` in the Konva stage, so editing handles always render above fills and the selection concern lives entirely in `canvas-atom.ts`.

**Architecture:** `PathRenderer` owns `pathLine` + `outerPathLine` in `fillLayer`; it is created for every visible mask and subscribes to Y.Doc for fill updates. `PathEditor` owns `ghostVertex` + all point/handle Konva groups in `handlesLayer`; it is created by `canvas-atom.ts` when a path is selected and destroyed on deselect — it never toggles visibility, it simply exists or doesn't. `canvas-atom.ts` holds a single `activeEditor: PathEditor | null` and creates/disposes it in the `activePathIdAtom` subscription.

**Tech Stack:** TypeScript, Konva.js, effect-atom (`Registry`, `Atom`), effect-yjs (`YLinkedListLens`), Effect `HashMap` / `HashSet`.

---

### Task 1: Create `PathRenderer` class (fill + stroke only)

**Files:**
- Create: `apps/editor/src/lib/canvas-objects/path-renderer.ts`
- Delete (at end of plan): `apps/editor/src/lib/canvas-objects/bezier-curve.ts`

**Context:**
`PathRenderer` replaces the fill/stroke concerns of the old `BezierPath`. It subscribes to the inner lens list atom (re-renders SVG path on change) and the outer lens list atom (re-renders outer dashed path). It also subscribes to `maskLens.bufferDistance` and `maskLens.outerMode` for recomputing uniform outer path. No point objects, no handles, no ghost.

**Public API:**
```typescript
export interface PathRendererOptions {
  onSelect?: () => void          // called when fill clicked while inactive
  color?: string                 // layer color hex
  fillOpacity?: number           // 0.15 | 0.25 | 0.35
  outerLens?: YLinkedListLens<BezierPointData>
  bufferDistance?: number
  outerMode?: "uniform" | "free"
  onBufferChange?: (distance: number) => void
  maskLens?: any
}

export class PathRenderer {
  constructor(
    lens: YLinkedListLens<BezierPointData>,
    fillLayer: Konva.Layer,
    options?: PathRendererOptions
  )
  setFillOpacity(opacity: number): void
  updateScale(zoom: number): void
  setHighlighted(on: boolean): void   // hover highlight on inactive fills
  getPoints(): ReadonlyArray<BezierPointData>
  appendPoint(x: number, y: number): string
  get isClosed(): boolean
  get innerLens(): YLinkedListLens<BezierPointData>
  get outerLens(): YLinkedListLens<BezierPointData> | null
  get currentBufferDistance(): number
  get currentOuterMode(): "uniform" | "free"
  dispose(): void
}
```

**Step 1: Create the file with the class skeleton and imports**

```typescript
// apps/editor/src/lib/canvas-objects/path-renderer.ts
import Konva from "konva"
import { Registry } from "@effect-atom/atom"
import type { YLinkedListLens } from "effect-yjs"
import { buildSvgPathData, computeOuterPath } from "./bezier-math"
import type { BezierPointData } from "./path"
import { createModuleLogger } from "../logger"
import { tokens } from "@/tokens"

const log = createModuleLogger("path-renderer")

const PATH_COLOR = tokens.color.canvas.edge
const PATH_COLOR_INACTIVE = tokens.color.canvas.edgeInactive
const PATH_WIDTH = tokens.canvas.pathWidth
const HIT_TOLERANCE = tokens.canvas.hitTolerance

export interface PathRendererOptions {
  onSelect?: () => void
  color?: string
  fillOpacity?: number
  outerLens?: YLinkedListLens<BezierPointData>
  bufferDistance?: number
  outerMode?: "uniform" | "free"
  onBufferChange?: (distance: number) => void
  maskLens?: any
}

export class PathRenderer {
  private readonly registry: Registry.Registry
  private readonly lens: YLinkedListLens<BezierPointData>
  private readonly fillLayer: Konva.Layer
  private readonly pathLine: Konva.Path
  private readonly outerPathLine: Konva.Path
  private readonly onSelect?: () => void
  private fillColor: string | null
  private fillOpacity: number
  private _outerLens: YLinkedListLens<BezierPointData> | null
  private _outerMode: "uniform" | "free"
  private _bufferDistance: number
  private _isClosed = false
  private currentZoom = 1
  private unsubscribeList: (() => void) | null = null
  private unsubscribeOuterList: (() => void) | null = null
  private unsubscribeMaskFields: (() => void) | null = null
  private readonly onBufferChange?: (distance: number) => void

  constructor(
    lens: YLinkedListLens<BezierPointData>,
    fillLayer: Konva.Layer,
    options?: PathRendererOptions,
  ) {
    this.lens = lens
    this.fillLayer = fillLayer
    this.registry = Registry.make()
    this.onSelect = options?.onSelect
    this.fillColor = options?.color ?? null
    this.fillOpacity = options?.fillOpacity ?? 0
    this._outerLens = options?.outerLens ?? null
    this._outerMode = options?.outerMode ?? "uniform"
    this._bufferDistance = options?.bufferDistance ?? 20
    this.onBufferChange = options?.onBufferChange

    this.pathLine = new Konva.Path({
      data: "",
      stroke: PATH_COLOR,
      strokeWidth: PATH_WIDTH,
      listening: true,
      hitStrokeWidth: HIT_TOLERANCE * 2,
    })
    this.fillLayer.add(this.pathLine)

    this.outerPathLine = new Konva.Path({
      data: "",
      stroke: this.fillColor ?? PATH_COLOR_INACTIVE,
      strokeWidth: 1,
      dash: [6, 4],
      opacity: 0.5,
      visible: false,
      listening: true,
      hitStrokeWidth: HIT_TOLERANCE * 2,
    })
    this.fillLayer.add(this.outerPathLine)

    this.pathLine.on("pointerdown", (e) => {
      e.cancelBubble = true
      this.onSelect?.()
    })

    this.startOuterDragHandler()
    this.startRenderLoop()
    this.startOuterRenderLoop()
    this.startMaskFieldSubscriptions(options?.maskLens)
  }
  // ... methods follow in next steps
}
```

**Step 2: Add `startRenderLoop`, `startOuterRenderLoop`, `startMaskFieldSubscriptions`**

Port these directly from `bezier-curve.ts` `startPathRenderLoop` (line 560), `startOuterRenderLoop` (line 570), and `startMaskFieldSubscriptions` (line 246). The logic is identical — just rename `this.layer` → `this.fillLayer` and remove any reference to `pointObjects`.

```typescript
  private startRenderLoop(): void {
    const listAtom = this.lens.atom()
    this.unsubscribeList = this.registry.subscribe(listAtom, () => {
      this.updatePathLine()
    }, { immediate: true })
  }

  private startOuterRenderLoop(): void {
    if (!this._outerLens) return
    const outerAtom = this._outerLens.atom()
    this.unsubscribeOuterList = this.registry.subscribe(outerAtom, () => {
      if (this._outerMode !== "free" || !this._outerLens) return
      const outerSvg = buildSvgPathData(this._outerLens.get())
      this.outerPathLine.data(outerSvg)
      this.fillLayer.batchDraw()
    }, { immediate: true })
  }

  private startMaskFieldSubscriptions(maskLens: any): void {
    if (!maskLens) return
    try {
      const bufferAtom = maskLens.focus("bufferDistance").atom()
      const modeAtom = maskLens.focus("outerMode").atom()

      const unsub1 = this.registry.subscribe(bufferAtom, (val: unknown) => {
        const dist = typeof val === "number" ? val : 20
        if (dist !== this._bufferDistance) {
          this._bufferDistance = dist
          if (this._outerMode === "uniform" && this._isClosed) this.rebuildOuterPath()
        }
      }, { immediate: true })

      const unsub2 = this.registry.subscribe(modeAtom, (val: unknown) => {
        const mode = val === "free" ? "free" as const : "uniform" as const
        if (mode !== this._outerMode) {
          this._outerMode = mode
          if (mode === "uniform" && this._isClosed) this.rebuildOuterPath()
        }
      }, { immediate: true })

      this.unsubscribeMaskFields = () => { unsub1(); unsub2() }
    } catch { /* new mask, fields not yet present */ }
  }
```

**Step 3: Add `updatePathLine`, `rebuildOuterPath`, `applyFill`**

Port directly from `bezier-curve.ts` lines 802–831 and 280–297. Replace `this.layer` → `this.fillLayer`.

```typescript
  private applyFill(): void {
    if (this._isClosed && this.fillColor && this.fillOpacity > 0) {
      this.pathLine.fill(this.fillColor)
      this.pathLine.opacity(this.fillOpacity)
    } else {
      this.pathLine.fill("")
      this.pathLine.opacity(1)
    }
  }

  private updatePathLine(): void {
    const points = this.lens.get()
    const svgData = buildSvgPathData(points)
    this.pathLine.data(svgData)
    const wasClosed = this._isClosed
    this._isClosed = svgData.includes("Z")
    if (this._isClosed !== wasClosed) this.applyFill()
    if (this._isClosed && this._outerLens) {
      if (this._outerMode === "uniform") {
        const outerPoints = computeOuterPath(points, this._bufferDistance)
        while (this._outerLens.length() > 0) this._outerLens.removeAt(0)
        for (const pt of outerPoints) this._outerLens.append(pt)
      }
      const outerSvg = buildSvgPathData(this._outerLens.get())
      this.outerPathLine.data(outerSvg)
      this.outerPathLine.visible(true)
    } else {
      this.outerPathLine.visible(false)
    }
    this.fillLayer.batchDraw()
  }

  private rebuildOuterPath(): void {
    if (!this._outerLens || !this._isClosed) return
    const points = this.lens.get()
    if (this._outerMode === "uniform") {
      const outerPoints = computeOuterPath(points, this._bufferDistance)
      while (this._outerLens.length() > 0) this._outerLens.removeAt(0)
      for (const pt of outerPoints) this._outerLens.append(pt)
    }
    this.outerPathLine.data(buildSvgPathData(this._outerLens.get()))
    this.outerPathLine.visible(true)
    this.fillLayer.batchDraw()
  }
```

**Step 4: Add `startOuterDragHandler`**

Port the `outerPathLine` drag-to-buffer handler from `bezier-curve.ts` lines 123–172. Exact same logic, just lives inside `PathRenderer` now.

**Step 5: Add public methods**

```typescript
  setFillOpacity(opacity: number): void {
    this.fillOpacity = opacity
    this.applyFill()
    this.fillLayer.batchDraw()
  }

  setHighlighted(on: boolean): void {
    if (on && this._isClosed) {
      this.pathLine.opacity(Math.min(this.fillOpacity + 0.15, 0.6))
    } else {
      this.applyFill()
    }
    this.fillLayer.batchDraw()
  }

  updateScale(zoom: number): void {
    this.currentZoom = zoom
    this.pathLine.strokeWidth(PATH_WIDTH / zoom)
    this.pathLine.hitStrokeWidth(HIT_TOLERANCE * 2 / zoom)
    this.outerPathLine.strokeWidth(1 / zoom)
    this.fillLayer.batchDraw()
  }

  getPoints(): ReadonlyArray<BezierPointData> {
    return this.lens.get()
  }

  appendPoint(x: number, y: number): string {
    return this.lens.append({
      x, y,
      handleInAngle: 0, handleInDistance: 0,
      handleOutAngle: 0, handleOutDistance: 0,
    })
  }

  get isClosed(): boolean { return this._isClosed }
  get innerLens(): YLinkedListLens<BezierPointData> { return this.lens }
  get outerLens(): YLinkedListLens<BezierPointData> | null { return this._outerLens }
  get currentBufferDistance(): number { return this._bufferDistance }
  get currentOuterMode(): "uniform" | "free" { return this._outerMode }

  dispose(): void {
    this.unsubscribeList?.()
    this.unsubscribeOuterList?.()
    this.unsubscribeMaskFields?.()
    this.outerPathLine.destroy()
    this.pathLine.destroy()
    this.registry.dispose()
  }
```

**Step 6: Verify TypeScript compiles**

```bash
cd /home/hfahmi/work/freelance/nur
pnpm --filter editor tsc --noEmit 2>&1 | head -40
```
Expected: errors only from `canvas-atom.ts` still importing `BezierPath` (old file untouched yet) — none from `path-renderer.ts`.

**Step 7: Commit**
```bash
git add apps/editor/src/lib/canvas-objects/path-renderer.ts
git commit -m "feat: add PathRenderer class (fill/stroke only, no handles)"
```

---

### Task 2: Create `PathEditor` class (interactive handles only)

**Files:**
- Create: `apps/editor/src/lib/canvas-objects/path-editor.ts`

**Context:**
`PathEditor` owns all interactive Konva objects: point circles, handle circles, handle lines, ghost vertex. It is constructed with an existing `PathRenderer` (to read lens/outerLens) and a dedicated `handlesLayer`. It does NOT own the fill — `PathRenderer` always owns that. On construction it immediately materializes all point objects. On `dispose()` it destroys all of them. `setEditingTarget` swaps between inner and outer point sets.

**Public API:**
```typescript
export interface PathEditorOptions {
  onBufferChange?: (distance: number) => void
}

export class PathEditor {
  constructor(
    renderer: PathRenderer,
    handlesLayer: Konva.Layer,
    options?: PathEditorOptions
  )
  setEditingTarget(target: "inner" | "outer"): void
  updateScale(zoom: number): void
  // for pen tool — direct point manipulation
  getPoints(): ReadonlyArray<BezierPointData>
  appendPoint(x: number, y: number): string    // delegates to renderer
  insertPointFromGhost(): void
  dispose(): void
}
```

**Step 1: Create the file with skeleton, imports, and PointObjects interface**

```typescript
// apps/editor/src/lib/canvas-objects/path-editor.ts
import Konva from "konva"
import * as HashMap from "effect/HashMap"
import * as HashSet from "effect/HashSet"
import { Registry } from "@effect-atom/atom"
import type { YLinkedListLens } from "effect-yjs"
import { cartesianToPolar, polarToCartesian } from "@/lib/domain/coordinate-utils"
import { buildSvgPathData, findNearestPointOnPath } from "./bezier-math"
import type { BezierPointData } from "./path"
import type { PathRenderer } from "./path-renderer"
import { createModuleLogger } from "../logger"
import { tokens } from "@/tokens"

const log = createModuleLogger("path-editor")

const POINT_RADIUS = tokens.canvas.pointRadius
const HANDLE_RADIUS = tokens.canvas.handleRadius
const POINT_COLOR = tokens.color.canvas.vertex
const HANDLE_COLOR = tokens.color.canvas.handle
const PATH_COLOR = tokens.color.canvas.edge
const HANDLE_LINE_COLOR = tokens.color.canvas.edgeGuide
const HIT_TOLERANCE = tokens.canvas.hitTolerance
const POINT_COLOR_HOVER = tokens.color.canvas.vertexHover
const HANDLE_COLOR_HOVER = tokens.color.canvas.handleHover
const POINT_HIT_BUFFER = tokens.canvas.pointHitBuffer
const HANDLE_HIT_BUFFER = tokens.canvas.handleHitBuffer

interface PointObjects {
  group: Konva.Group
  pointCircle: Konva.Circle
  handleInLine: Konva.Line
  handleInCircle: Konva.Circle
  handleOutLine: Konva.Line
  handleOutCircle: Konva.Circle
  unsubscribe: () => void
}

export interface PathEditorOptions {
  onBufferChange?: (distance: number) => void
}

export class PathEditor {
  private readonly registry: Registry.Registry
  private readonly renderer: PathRenderer
  private readonly handlesLayer: Konva.Layer
  private readonly ghostVertex: Konva.Circle
  private pointObjects: HashMap.HashMap<string, PointObjects> = HashMap.empty()
  private currentIds: HashSet.HashSet<string> = HashSet.empty()
  private outerPointObjects: HashMap.HashMap<string, PointObjects> = HashMap.empty()
  private outerCurrentIds: HashSet.HashSet<string> = HashSet.empty()
  private unsubscribeIds: (() => void) | null = null
  private unsubscribeOuterIds: (() => void) | null = null
  private editingTarget: "inner" | "outer" = "inner"
  private currentZoom = 1
  private ghostSplitResult: ReturnType<typeof findNearestPointOnPath> | null = null
  private readonly onBufferChange?: (distance: number) => void

  constructor(
    renderer: PathRenderer,
    handlesLayer: Konva.Layer,
    options?: PathEditorOptions,
  ) {
    this.renderer = renderer
    this.handlesLayer = handlesLayer
    this.registry = Registry.make()
    this.onBufferChange = options?.onBufferChange

    this.ghostVertex = new Konva.Circle({
      radius: POINT_RADIUS,
      fill: POINT_COLOR,
      opacity: tokens.canvas.ghostOpacity,
      visible: false,
      listening: false,
    })
    this.handlesLayer.add(this.ghostVertex)

    this.startStructuralLoop()
    this.startGhostHandlers()
    this.startOuterDragHandler()
  }
  // methods follow
}
```

**Step 2: Add `startStructuralLoop` (subscribes to inner lens ids)**

Port from `bezier-curve.ts` `startStructuralLoop` (line 547) and `syncPointObjects` (line 583). Uses `renderer.innerLens`.

```typescript
  private startStructuralLoop(): void {
    const idsAtom = this.renderer.innerLens.ids()
    this.unsubscribeIds = this.registry.subscribe(idsAtom, (newIds) => {
      const oldIds = this.currentIds
      this.currentIds = newIds

      const removed = HashSet.difference(oldIds, newIds)
      HashSet.forEach(removed, (id) => {
        const entry = HashMap.get(this.pointObjects, id)
        if (entry._tag === "Some") {
          entry.value.unsubscribe()
          entry.value.group.destroy()
          this.pointObjects = HashMap.remove(this.pointObjects, id)
        }
      })

      const added = HashSet.difference(newIds, oldIds)
      HashSet.forEach(added, (id) => {
        const objects = this.createPointObjects(id, this.renderer.innerLens)
        this.pointObjects = HashMap.set(this.pointObjects, id, objects)
      })

      this.handlesLayer.batchDraw()
    }, { immediate: true })
  }
```

**Step 3: Add `createPointObjects` (creates handles + vertex for one point)**

Port from `bezier-curve.ts` `createPointObjects` (line 608) and `createPointObjectsForLens` (line 439) — merge them since we no longer need two variants. The group is added to `handlesLayer` not `fillLayer`.

```typescript
  private createPointObjects(
    id: string,
    targetLens: YLinkedListLens<BezierPointData>,
  ): PointObjects {
    const nodeLens = targetLens.find(id)
    const group = new Konva.Group()

    const handleInLine = new Konva.Line({
      points: [0, 0, 0, 0], stroke: HANDLE_LINE_COLOR,
      strokeWidth: tokens.canvas.guideStrokeWidth, visible: false,
    })
    const handleInCircle = new Konva.Circle({
      radius: HANDLE_RADIUS, fill: HANDLE_COLOR,
      draggable: true, visible: false, hitStrokeWidth: HANDLE_HIT_BUFFER,
    })
    const handleOutLine = new Konva.Line({
      points: [0, 0, 0, 0], stroke: HANDLE_LINE_COLOR,
      strokeWidth: tokens.canvas.guideStrokeWidth, visible: false,
    })
    const handleOutCircle = new Konva.Circle({
      radius: HANDLE_RADIUS, fill: HANDLE_COLOR,
      draggable: true, visible: false, hitStrokeWidth: HANDLE_HIT_BUFFER,
    })
    const pointCircle = new Konva.Circle({
      radius: POINT_RADIUS, fill: POINT_COLOR,
      stroke: tokens.color.canvas.vertexStroke,
      strokeWidth: tokens.canvas.pointStrokeWidth,
      draggable: true, hitStrokeWidth: POINT_HIT_BUFFER,
    })

    group.add(handleInLine, handleInCircle, handleOutLine, handleOutCircle, pointCircle)
    this.handlesLayer.add(group)

    // Drag: Konva → Y.Doc
    pointCircle.on("dragmove", () => {
      nodeLens.focus("x").syncSet(pointCircle.x())
      nodeLens.focus("y").syncSet(pointCircle.y())
    })
    handleInCircle.on("dragmove", () => {
      const data = nodeLens.syncGet()
      if (!data) return
      const polar = cartesianToPolar(data.x, data.y, handleInCircle.x(), handleInCircle.y())
      nodeLens.focus("handleInAngle").syncSet(polar.angle)
      nodeLens.focus("handleInDistance").syncSet(polar.distance)
    })
    handleOutCircle.on("dragmove", () => {
      const data = nodeLens.syncGet()
      if (!data) return
      const polar = cartesianToPolar(data.x, data.y, handleOutCircle.x(), handleOutCircle.y())
      nodeLens.focus("handleOutAngle").syncSet(polar.angle)
      nodeLens.focus("handleOutDistance").syncSet(polar.distance)
    })

    handleInCircle.on("pointerdown", (e) => { e.cancelBubble = true })
    handleOutCircle.on("pointerdown", (e) => { e.cancelBubble = true })

    // Hover
    pointCircle.on("pointerenter", () => {
      pointCircle.fill(POINT_COLOR_HOVER)
      const s = this.handlesLayer.getStage()
      if (s) s.container().style.cursor = "move"
      this.handlesLayer.batchDraw()
    })
    pointCircle.on("pointerleave", () => {
      pointCircle.fill(POINT_COLOR)
      const s = this.handlesLayer.getStage()
      if (s) s.container().style.cursor = "default"
      this.handlesLayer.batchDraw()
    })
    handleInCircle.on("pointerenter", () => { handleInCircle.fill(HANDLE_COLOR_HOVER); this.handlesLayer.batchDraw() })
    handleInCircle.on("pointerleave", () => { handleInCircle.fill(HANDLE_COLOR); this.handlesLayer.batchDraw() })
    handleOutCircle.on("pointerenter", () => { handleOutCircle.fill(HANDLE_COLOR_HOVER); this.handlesLayer.batchDraw() })
    handleOutCircle.on("pointerleave", () => { handleOutCircle.fill(HANDLE_COLOR); this.handlesLayer.batchDraw() })

    // Reactive: Y.Doc → Konva
    const nodeAtom = nodeLens.atom()
    const initialData = this.registry.get(nodeAtom)
    if (initialData) {
      this.updatePointKonva(initialData, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
    }
    const unsubscribe = this.registry.subscribe(nodeAtom, (data) => {
      if (!data) return
      this.updatePointKonva(data, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
      this.handlesLayer.batchDraw()
    })

    const result = { group, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle, unsubscribe }
    if (this.currentZoom !== 1) this.applyInverseScale(result, 1 / this.currentZoom)
    return result
  }
```

**Step 4: Add `updatePointKonva`, `applyInverseScale`**

Port directly from `bezier-curve.ts` lines 766–798 and 315–320. Replace `this.layer` → `this.handlesLayer`.

**Step 5: Add `startGhostHandlers` (ghost vertex on inner path hover)**

Port the `pathLine.on("pointermove")` and `pathLine.on("pointerleave")` logic from `bezier-curve.ts` lines 205–237. Ghost vertex lives in `handlesLayer`. The path hover events need to be attached to the fill's `pathLine` — access it via a method on `PathRenderer`. Add `get pathLineNode(): Konva.Path` getter to `PathRenderer` (returns `this.pathLine`).

```typescript
  private startGhostHandlers(): void {
    // PathRenderer exposes pathLineNode so editor can attach ghost hover
    const pathLine = (this.renderer as any).pathLine as Konva.Path
    pathLine.on("pointermove.editor", () => {
      const stage = this.handlesLayer.getStage()
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return
      const points = this.renderer.getPoints()
      const nodesMap = this.renderer.innerLens.nodes()
      const ids = Array.from(nodesMap.keys())
      const result = findNearestPointOnPath(points, pos.x, pos.y, HIT_TOLERANCE, ids)
      if (result) {
        this.ghostVertex.position({ x: result.point.x, y: result.point.y })
        this.ghostVertex.visible(true)
        this.ghostSplitResult = result
        stage.container().style.cursor = "copy"
      } else {
        this.ghostVertex.visible(false)
        this.ghostSplitResult = null
      }
      this.handlesLayer.batchDraw()
    })
    pathLine.on("pointerleave.editor", () => {
      this.ghostVertex.visible(false)
      this.ghostSplitResult = null
      const s = this.handlesLayer.getStage()
      if (s) s.container().style.cursor = "default"
      this.handlesLayer.batchDraw()
    })
    pathLine.on("pointerdown.editor", (e) => {
      e.cancelBubble = true
      if (this.ghostSplitResult) this.insertPointFromGhost()
    })
  }
```

Note: use namespaced Konva events (`.editor` suffix) so dispose can cleanly remove them with `pathLine.off("pointermove.editor")`.

**Step 6: Add `setEditingTarget`**

Port from `bezier-curve.ts` lines 351–386. Inner → destroy outer objects, show inner. Outer → destroy inner objects (but keep them subscribed for re-show), create outer objects.

```typescript
  setEditingTarget(target: "inner" | "outer"): void {
    if (this.editingTarget === target) return
    this.editingTarget = target

    if (target === "inner") {
      this.destroyOuterPointObjects()
      HashMap.forEach(this.pointObjects, (objects) => { objects.group.visible(true) })
    } else {
      HashMap.forEach(this.pointObjects, (objects) => { objects.group.visible(false) })
      this.createOuterPointObjects()
    }
    this.ghostVertex.visible(false)
    this.ghostSplitResult = null
    this.handlesLayer.batchDraw()
  }

  private createOuterPointObjects(): void {
    const outerLens = this.renderer.outerLens
    if (!outerLens) return
    this.destroyOuterPointObjects()
    const idsAtom = outerLens.ids()
    const ids = this.registry.get(idsAtom)
    this.outerCurrentIds = ids
    HashSet.forEach(ids, (id) => {
      const objects = this.createPointObjects(id, outerLens)
      this.outerPointObjects = HashMap.set(this.outerPointObjects, id, objects)
    })
    this.unsubscribeOuterIds = this.registry.subscribe(idsAtom, (newIds) => {
      const oldIds = this.outerCurrentIds
      this.outerCurrentIds = newIds
      const removed = HashSet.difference(oldIds, newIds)
      HashSet.forEach(removed, (id) => {
        const entry = HashMap.get(this.outerPointObjects, id)
        if (entry._tag === "Some") {
          entry.value.unsubscribe()
          entry.value.group.destroy()
          this.outerPointObjects = HashMap.remove(this.outerPointObjects, id)
        }
      })
      const added = HashSet.difference(newIds, oldIds)
      HashSet.forEach(added, (id) => {
        const objects = this.createPointObjects(id, outerLens!)
        this.outerPointObjects = HashMap.set(this.outerPointObjects, id, objects)
      })
      this.handlesLayer.batchDraw()
    })
  }

  private destroyOuterPointObjects(): void {
    this.unsubscribeOuterIds?.()
    this.unsubscribeOuterIds = null
    HashMap.forEach(this.outerPointObjects, (objects) => {
      objects.unsubscribe()
      objects.group.destroy()
    })
    this.outerPointObjects = HashMap.empty()
    this.outerCurrentIds = HashSet.empty()
  }
```

**Step 7: Add `updateScale`, `getPoints`, `appendPoint`, `insertPointFromGhost`, `dispose`**

```typescript
  updateScale(zoom: number): void {
    this.currentZoom = zoom
    const inv = 1 / zoom
    HashMap.forEach(this.pointObjects, (objects) => { this.applyInverseScale(objects, inv) })
    HashMap.forEach(this.outerPointObjects, (objects) => { this.applyInverseScale(objects, inv) })
    this.ghostVertex.scale({ x: inv, y: inv })
    this.handlesLayer.batchDraw()
  }

  getPoints(): ReadonlyArray<BezierPointData> {
    return this.renderer.getPoints()
  }

  appendPoint(x: number, y: number): string {
    return this.renderer.appendPoint(x, y)
  }

  insertPointFromGhost(): void {
    const result = this.ghostSplitResult
    if (!result) return
    const nodesMap = this.renderer.innerLens.nodes()
    const ids = Array.from(nodesMap.keys())
    const prevLens = this.renderer.innerLens.find(result.afterId)
    prevLens.focus("handleOutAngle").syncSet(result.updatedPrevHandleOut.angle)
    prevLens.focus("handleOutDistance").syncSet(result.updatedPrevHandleOut.distance)
    const afterIdx = ids.indexOf(result.afterId)
    if (afterIdx >= 0 && afterIdx < ids.length - 1) {
      const nextId = ids[afterIdx + 1]
      const nextLens = this.renderer.innerLens.find(nextId)
      nextLens.focus("handleInAngle").syncSet(result.updatedNextHandleIn.angle)
      nextLens.focus("handleInDistance").syncSet(result.updatedNextHandleIn.distance)
    }
    this.renderer.innerLens.insertAfter(result.afterId, result.point)
    this.ghostVertex.visible(false)
    this.ghostSplitResult = null
  }

  dispose(): void {
    // Remove ghost event listeners from the renderer's pathLine
    const pathLine = (this.renderer as any).pathLine as Konva.Path
    pathLine.off("pointermove.editor")
    pathLine.off("pointerleave.editor")
    pathLine.off("pointerdown.editor")

    this.unsubscribeIds?.()
    HashMap.forEach(this.pointObjects, (objects) => {
      objects.unsubscribe()
      objects.group.destroy()
    })
    this.pointObjects = HashMap.empty()

    this.destroyOuterPointObjects()
    this.ghostVertex.destroy()
    this.registry.dispose()
  }
```

**Step 8: Verify TypeScript compiles**

```bash
cd /home/hfahmi/work/freelance/nur
pnpm --filter editor tsc --noEmit 2>&1 | head -40
```
Expected: errors only from `canvas-atom.ts` (still uses old `BezierPath`).

**Step 9: Commit**
```bash
git add apps/editor/src/lib/canvas-objects/path-editor.ts
git commit -m "feat: add PathEditor class (interactive handles, ghost vertex)"
```

---

### Task 3: Update `canvas-atom.ts` to use `PathRenderer` + `PathEditor`

**Files:**
- Modify: `apps/editor/src/lib/canvas-atom.ts`

**Context:**
This is the integration task. The stage gets a third layer (`handlesLayer`). The `paths` HashMap changes from `MutableHashMap<string, BezierPath>` to `MutableHashMap<string, PathRenderer>`. A single `activeEditor: PathEditor | null` variable replaces all `setActive()` calls. The `activePathIdAtom` subscription creates/disposes `PathEditor`. The pen tool creates a `PathEditor` immediately alongside the `PathRenderer` for the new mask.

**Step 1: Add `handlesLayer` to stage creation**

At line 43, after `const pathsLayer = new Konva.Layer()`:
```typescript
const handlesLayer = new Konva.Layer()
stage.add(imageLayer)
stage.add(pathsLayer)
stage.add(handlesLayer)  // always on top
```

**Step 2: Update imports**

Replace:
```typescript
import { BezierPath } from "./canvas-objects/bezier-curve"
```
With:
```typescript
import { PathRenderer } from "./canvas-objects/path-renderer"
import { PathEditor } from "./canvas-objects/path-editor"
```

**Step 3: Update state variables**

Replace:
```typescript
const paths = MutableHashMap.empty<string, BezierPath>()
```
With:
```typescript
const paths = MutableHashMap.empty<string, PathRenderer>()
let activeEditor: PathEditor | null = null
```

**Step 4: Update `disposeAllPaths`**

```typescript
function disposeAllPaths() {
  activeEditor?.dispose()
  activeEditor = null
  MutableHashMap.forEach(paths, (renderer) => renderer.dispose())
  MutableHashMap.clear(paths)
}
```

**Step 5: Update `syncPaths`**

The `handlesLayer` also needs clearing when frame changes:
```typescript
function syncPaths(frameId: string | null) {
  if (frameId !== currentFrameId) {
    disposeAllPaths()
    pathsLayer.destroyChildren()
    handlesLayer.destroyChildren()
    currentFrameId = frameId
  }
  if (!frameId) return

  const activeLayerId = getActiveLayerId()
  if (!activeLayerId) {
    syncAllLayerPaths(frameId)
  } else {
    syncLayerPaths(activeLayerId, frameId)
  }

  pathsLayer.moveToTop()
  handlesLayer.moveToTop()
  pathsLayer.batchDraw()
  handlesLayer.batchDraw()
}
```

**Step 6: Update `syncLayerPaths` — remove all `setActive` calls**

```typescript
function syncLayerPaths(layerId: string, frameId: string) {
  activeEditor?.dispose()
  activeEditor = null
  disposeAllPaths()
  pathsLayer.destroyChildren()
  handlesLayer.destroyChildren()

  const layerData = (root.focus("layers").focus(layerId) as any).syncGet()
  const layerColor = layerData?.color as string | undefined
  const activePathId = getActivePathId()

  const frameMasks = getFrameMasks(layerId, frameId)
  if (frameMasks) {
    for (const [maskId, _maskData] of Object.entries(frameMasks)) {
      const maskLens = (root.focus("layers").focus(layerId) as any).focus("masks").focus(frameId).focus(maskId)
      const innerLens = maskLens.focus("inner")
      const outerLens = maskLens.focus("outer")
      const maskData = maskLens.syncGet()
      const pathKey = `${layerId}:${frameId}:${maskId}`
      const renderer = new PathRenderer(innerLens, pathsLayer, {
        onSelect: () => appRegistry.set(activePathIdRawAtom, pathKey),
        color: layerColor,
        fillOpacity: 0.35,
        outerLens,
        bufferDistance: maskData?.bufferDistance ?? 20,
        outerMode: maskData?.outerMode ?? "uniform",
        onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
        maskLens,
      })
      MutableHashMap.set(paths, pathKey, renderer)

      // If this mask is already the active path, create its editor immediately
      if (pathKey === activePathId) {
        activeEditor = new PathEditor(renderer, handlesLayer, {
          onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
        })
        activeEditor.updateScale(getCurrentZoom())
      }
    }
  }

  // Other layers — fill-only renderers (no onSelect for now, or with onSelect to switch layers)
  const allLayers = (root.focus("layers").syncGet() ?? {}) as Record<string, any>
  for (const [otherId, otherData] of Object.entries(allLayers)) {
    if (otherId === layerId) continue
    const otherFrameMasks = getFrameMasks(otherId, frameId)
    if (!otherFrameMasks) continue
    for (const [maskId] of Object.entries(otherFrameMasks)) {
      const otherMaskLens = (root.focus("layers").focus(otherId) as any).focus("masks").focus(frameId).focus(maskId)
      const otherInnerLens = otherMaskLens.focus("inner")
      const otherKey = `${otherId}:${frameId}:${maskId}`
      const renderer = new PathRenderer(otherInnerLens, pathsLayer, {
        color: (otherData as any).color,
        fillOpacity: 0.15,
      })
      MutableHashMap.set(paths, otherKey, renderer)
    }
  }
}
```

Add helper:
```typescript
function getCurrentZoom(): number {
  const r = appRegistry.get(zoomAtom) as any
  return r?._tag === "Success" ? r.value : 1
}
```

**Step 7: Update `syncAllLayerPaths`**

Same pattern — `PathRenderer` only, no `setActive`, no editor:
```typescript
function syncAllLayerPaths(frameId: string) {
  activeEditor?.dispose()
  activeEditor = null
  disposeAllPaths()
  pathsLayer.destroyChildren()
  handlesLayer.destroyChildren()

  const layersRecord = (root.focus("layers").syncGet() ?? {}) as Record<string, any>
  for (const [layerId, layerData] of Object.entries(layersRecord)) {
    const frameMasks = getFrameMasks(layerId, frameId)
    if (!frameMasks) continue
    for (const [maskId, _maskData] of Object.entries(frameMasks)) {
      const maskLens = (root.focus("layers").focus(layerId) as any).focus("masks").focus(frameId).focus(maskId)
      const innerLens = maskLens.focus("inner")
      const outerLens = maskLens.focus("outer")
      const maskData = maskLens.syncGet()
      const pathKey = `${layerId}:${frameId}:${maskId}`
      const renderer = new PathRenderer(innerLens, pathsLayer, {
        onSelect: () => appRegistry.set(activePathIdRawAtom, pathKey),
        color: (layerData as any).color,
        fillOpacity: 0.25,
        outerLens,
        bufferDistance: maskData?.bufferDistance ?? 20,
        outerMode: maskData?.outerMode ?? "uniform",
        maskLens,
      })
      MutableHashMap.set(paths, pathKey, renderer)
    }
  }
}
```

**Step 8: Replace `activePathIdAtom` subscription**

Replace lines 312–317:
```typescript
get.subscribe(activePathIdAtom, (pathIdResult) => {
  const activePathId = pathIdResult._tag === "Success" ? pathIdResult.value : null
  activeEditor?.dispose()
  activeEditor = null
  if (activePathId) {
    const renderer = MutableHashMap.get(paths, activePathId)
    if (renderer._tag === "Some") {
      activeEditor = new PathEditor(renderer.value, handlesLayer, {
        onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
      })
      activeEditor.updateScale(getCurrentZoom())
    }
  }
  handlesLayer.batchDraw()
})
```

**Step 9: Replace zoom subscription — update editor scale**

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
  MutableHashMap.forEach(paths, (renderer) => renderer.updateScale(zoom))
  activeEditor?.updateScale(zoom)
  appRegistry.set(stagePositionAtom, { x: stage.x(), y: stage.y() })
  stage.batchDraw()
})
```

**Step 10: Replace `editingPathTargetAtom` subscription**

```typescript
get.subscribe(editingPathTargetAtom, (target) => {
  activeEditor?.setEditingTarget(target)
})
```

**Step 11: Remove `editMaskModeAtom` subscription**

Delete lines 368–374 entirely. `PathEditor` handles its own cleanup on `dispose()` — no need for a re-sync on exit.

Wait — `editMaskModeAtom` was used to re-sync when exiting edit mask mode to remove point objects. With the new design, `activeEditor?.dispose()` in the `activePathIdAtom` subscription already handles this. The subscription is no longer needed.

**Step 12: Update pen tool path creation (lines 417–451)**

Replace `new BezierPath(...)` + `bp.setActive(true)` with `PathRenderer` + `PathEditor`:

```typescript
activeMaskId = crypto.randomUUID()
const maskLens = frameMasksLens.focus(activeMaskId)
;(maskLens as any).syncSet({ name: null, inner: [], outer: [], bufferDistance: 20, outerMode: "uniform" })

const pathKey = `${activeLayerId}:${currentFrameId}:${activeMaskId}`
const innerLens = maskLens.focus("inner")
const outerLens = maskLens.focus("outer")
const renderer = new PathRenderer(innerLens, pathsLayer, {
  onSelect: () => appRegistry.set(activePathIdRawAtom, pathKey),
  color: layerData?.color,
  fillOpacity: 0.35,
  outerLens,
  bufferDistance: 20,
  outerMode: "uniform",
  onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
  maskLens,
})
MutableHashMap.set(paths, pathKey, renderer)

// Dispose previous editor (if any) and create one for this new path
activeEditor?.dispose()
activeEditor = new PathEditor(renderer, handlesLayer, {
  onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
})
activeEditor.updateScale(getCurrentZoom())
appRegistry.set(activePathIdRawAtom, pathKey)
pathsLayer.moveToTop()
handlesLayer.moveToTop()
```

**Step 13: Update pen tool point access**

Lines 453–482 use `bp.value.getPoints()` and `bp.value.appendPoint(...)`. Replace:
```typescript
// Before: const bp = MutableHashMap.get(paths, pathKey); bp.value.getPoints()
// After:
const editorNow = activeEditor  // already set above
if (!editorNow) return
const points = editorNow.getPoints()
// ...
editorNow.appendPoint(first.x, first.y)
// ...
editorNow.appendPoint(pos.x, pos.y)
```

**Step 14: Update cleanup in `get.addFinalizer`**

```typescript
get.addFinalizer(() => {
  // ...existing cleanup...
  activeEditor?.dispose()
  activeEditor = null
  disposeAllPaths()
  // ...
})
```

**Step 15: Verify TypeScript compiles with zero errors**

```bash
cd /home/hfahmi/work/freelance/nur
pnpm --filter editor tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 16: Commit**
```bash
git add apps/editor/src/lib/canvas-atom.ts
git commit -m "refactor: canvas-atom uses PathRenderer + PathEditor, adds handlesLayer"
```

---

### Task 4: Delete old `bezier-curve.ts`

**Files:**
- Delete: `apps/editor/src/lib/canvas-objects/bezier-curve.ts`

**Step 1: Verify nothing imports `bezier-curve`**

```bash
grep -r "bezier-curve" /home/hfahmi/work/freelance/nur/apps/editor/src/
```
Expected: no output.

**Step 2: Delete the file**

```bash
rm apps/editor/src/lib/canvas-objects/bezier-curve.ts
```

**Step 3: Verify TypeScript still compiles**

```bash
pnpm --filter editor tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 4: Commit**
```bash
git add -u apps/editor/src/lib/canvas-objects/bezier-curve.ts
git commit -m "chore: remove obsolete BezierPath class"
```

---

### Task 5: Smoke test in the browser

**No code changes — manual verification only.**

**Step 1: Start the dev server**
```bash
cd /home/hfahmi/work/freelance/nur
pnpm --filter editor dev
```

**Step 2: Verify these scenarios work correctly**

| Scenario | Expected |
|----------|----------|
| Open a project with existing masks | Fills render correctly, no handles visible |
| Click a mask fill | Handles appear on that mask only |
| Click a different mask fill | Handles move to the new mask, old mask shows fill only |
| Draw a new mask with pen tool | Handles visible while drawing |
| Close the path | Outer dashed path appears, handles remain |
| Click away / deselect | Handles disappear |
| Copy from previous frame | New mask fills appear, click one → handles appear |
| Zoom in/out | Handles scale correctly, fills scale with stage |
| Switch inner/outer editing target | Correct set of handles shown |

**Step 3: Open browser DevTools, check for JS errors**

Expected: no errors in console.

---

### Task 6: Run existing E2E tests

**Step 1: Run the E2E suite**
```bash
cd /home/hfahmi/work/freelance/nur
pnpm --filter editor test:e2e 2>&1 | tail -30
```
Expected: all previously passing tests still pass.

**Step 2: Fix any regressions before merging**

If tests fail, read the error output, trace back to which canvas interaction broke, and fix in the appropriate class (`PathRenderer` or `PathEditor`).

---
