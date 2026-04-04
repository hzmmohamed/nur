# Inner/Outer Mask Path Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-path mask with an inner/outer path pair for lighting falloff, with uniform buffer auto-generation and free-edit mode.

**Architecture:** The mask schema changes from a bare `YLinkedList(BezierPointSchema)` to a `MaskSchema` struct containing inner path, outer path, buffer distance, and outer mode. The `BezierPath` class is extended to manage both paths. A new `computeOuterPath` pure function generates the outer path from the inner path at a given buffer distance. The canvas bar adds inner/outer toggle and buffer controls when editing a closed mask.

**Tech Stack:** Effect Schema, effect-yjs (YLinkedList), Konva, effect-atom, React

---

### Task 1: Add MaskSchema to @nur/core

**Files:**
- Modify: `packages/core/src/schemas/layer.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Define MaskSchema**

In `packages/core/src/schemas/layer.ts`, add after `LayerOrderEntrySchema`:

```typescript
export const OuterModeSchema = S.Literal("uniform", "free")
export type OuterMode = S.Schema.Type<typeof OuterModeSchema>

export const MaskSchema = S.Struct({
  inner: YLinkedList(BezierPointSchema),
  outer: YLinkedList(BezierPointSchema),
  bufferDistance: S.Number,
  outerMode: OuterModeSchema,
})

export type Mask = S.Schema.Type<typeof MaskSchema>
```

Import `BezierPointSchema` from `./frame` (already imported) and `YLinkedList` from `effect-yjs` (already imported).

**Step 2: Update LayerSchema masks field**

Change the masks field from:
```typescript
masks: S.Record({ key: S.String, value: YLinkedList(BezierPointSchema) }),
```
to:
```typescript
masks: S.Record({ key: S.String, value: MaskSchema }),
```

**Step 3: Export from index.ts**

Add to the layer exports:
```typescript
export { LayerSchema, LayerGroupSchema, LayerOrderEntrySchema, MaskSchema, OuterModeSchema, type Layer, type LayerGroup, type LayerOrderEntry, type Mask, type OuterMode } from "./schemas/layer"
```

**Step 4: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/core
```

This will fail on downstream consumers — that's expected. We'll fix them in subsequent tasks.

---

### Task 2: Add outer path computation to bezier-math

**Files:**
- Modify: `apps/editor/src/lib/canvas-objects/bezier-math.ts`

**Context:** The `computeOuterPath` function takes an array of inner path `BezierPointData` points and a buffer distance, and returns a new array of `BezierPointData` for the outer path. Each point is offset outward along the average normal of its two adjacent edge directions. Handle angles stay the same; handle distances are scaled proportionally.

**Step 1: Add `computeOuterPath` function**

Append to `bezier-math.ts`:

```typescript
/**
 * Compute the outward normal direction at a path vertex.
 * Uses the average of the incoming and outgoing edge directions,
 * rotated 90° outward (assuming clockwise winding for "outward" = left normal).
 */
function vertexNormal(
  prev: Point2D | null,
  curr: Point2D,
  next: Point2D | null,
): Point2D {
  let nx = 0, ny = 0

  if (prev) {
    const dx = curr.x - prev.x
    const dy = curr.y - prev.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    // Left normal of incoming edge
    nx += -dy / len
    ny += dx / len
  }

  if (next) {
    const dx = next.x - curr.x
    const dy = next.y - curr.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    // Left normal of outgoing edge
    nx += -dy / len
    ny += dx / len
  }

  const len = Math.sqrt(nx * nx + ny * ny) || 1
  return { x: nx / len, y: ny / len }
}

/**
 * Generate an outer path by offsetting each inner path point
 * along its outward normal by `bufferDistance`.
 *
 * Handle angles are preserved. Handle distances are scaled by
 * (1 + bufferDistance / avgEdgeLength) to maintain curve shape.
 */
export function computeOuterPath(
  innerPoints: ReadonlyArray<BezierPointData>,
  bufferDistance: number,
): BezierPointData[] {
  if (innerPoints.length === 0) return []

  // Compute average edge length for handle scaling
  let totalLen = 0
  for (let i = 1; i < innerPoints.length; i++) {
    const dx = innerPoints[i].x - innerPoints[i - 1].x
    const dy = innerPoints[i].y - innerPoints[i - 1].y
    totalLen += Math.sqrt(dx * dx + dy * dy)
  }
  const avgEdgeLen = innerPoints.length > 1 ? totalLen / (innerPoints.length - 1) : 1
  const handleScale = avgEdgeLen > 0 ? 1 + bufferDistance / avgEdgeLen : 1

  const isClosed =
    innerPoints.length >= 3 &&
    innerPoints[0].x === innerPoints[innerPoints.length - 1].x &&
    innerPoints[0].y === innerPoints[innerPoints.length - 1].y

  return innerPoints.map((pt, i) => {
    const prev = i > 0
      ? innerPoints[i - 1]
      : isClosed ? innerPoints[innerPoints.length - 2] : null
    const next = i < innerPoints.length - 1
      ? innerPoints[i + 1]
      : isClosed ? innerPoints[1] : null

    const normal = vertexNormal(
      prev ? { x: prev.x, y: prev.y } : null,
      { x: pt.x, y: pt.y },
      next ? { x: next.x, y: next.y } : null,
    )

    return {
      x: pt.x + normal.x * bufferDistance,
      y: pt.y + normal.y * bufferDistance,
      handleInAngle: pt.handleInAngle,
      handleInDistance: pt.handleInDistance * handleScale,
      handleOutAngle: pt.handleOutAngle,
      handleOutDistance: pt.handleOutDistance * handleScale,
    }
  })
}
```

**Step 2: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 3: Update BezierPath to render inner + outer paths

**Files:**
- Modify: `apps/editor/src/lib/canvas-objects/bezier-curve.ts`

**Context:** BezierPath currently manages one `Konva.Path` (pathLine) and one set of point objects. It needs a second `Konva.Path` (outerPathLine) for the outer boundary. The outer path is rendered as a dashed stroke in the layer color — no fill, no point handles. When `outerMode === "uniform"`, the outer path auto-updates whenever the inner path changes. When `outerMode === "free"`, the outer path has its own set of point objects (only visible when editing the outer).

**Step 1: Update BezierPathOptions**

Add new fields:

```typescript
export interface BezierPathOptions {
  onSelect?: () => void
  color?: string
  fillOpacity?: number
  /** Outer path lens (from MaskSchema.outer). If provided, outer path is rendered. */
  outerLens?: YLinkedListLens<BezierPointData>
  /** Buffer distance for uniform mode auto-generation */
  bufferDistance?: number
  /** Outer mode: "uniform" (auto-compute) or "free" (independent editing) */
  outerMode?: "uniform" | "free"
}
```

**Step 2: Add outer path Konva object**

In the constructor, after creating `this.pathLine`, create `this.outerPathLine`:

```typescript
// Outer path (dashed stroke, no fill, behind inner)
this.outerPathLine = new Konva.Path({
  data: "",
  stroke: this.fillColor ?? PATH_COLOR_INACTIVE,
  strokeWidth: 1,
  dash: [6, 4],
  opacity: 0.5,
  listening: false,
})
this.layer.add(this.outerPathLine)
```

Add the field declaration:
```typescript
private readonly outerPathLine: Konva.Path
private outerLens: YLinkedListLens<BezierPointData> | null = null
private outerMode: "uniform" | "free" = "uniform"
private bufferDistance: number = 20
private unsubscribeOuterList: (() => void) | null = null
```

**Step 3: Update `updatePathLine` to also update outer path**

After rebuilding the inner SVG data, if `outerMode === "uniform"` and the inner path is closed, compute and write the outer path:

```typescript
private updatePathLine(): void {
  const points = this.lens.get()
  const svgData = buildSvgPathData(points)
  this.pathLine.data(svgData)
  const wasClosed = this.isClosed
  this.isClosed = svgData.includes("Z")
  if (this.isClosed !== wasClosed) {
    this.applyFill()
  }

  // Update outer path
  if (this.isClosed && this.outerLens) {
    if (this.outerMode === "uniform") {
      // Auto-compute outer from inner
      const outerPoints = computeOuterPath(points, this.bufferDistance)
      this.outerLens.clear()
      for (const pt of outerPoints) {
        this.outerLens.append(pt)
      }
    }
    // Render outer (both uniform and free read from the lens)
    const outerPoints = this.outerLens.get()
    const outerSvg = buildSvgPathData(outerPoints)
    this.outerPathLine.data(outerSvg)
    this.outerPathLine.visible(true)
  } else {
    this.outerPathLine.visible(false)
  }

  this.layer.batchDraw()
}
```

Import `computeOuterPath` from `./bezier-math`.

**Step 4: Start outer path render loop for free mode**

If `outerMode === "free"` and `outerLens` is provided, subscribe to the outer lens atom to update the outer path line independently of the inner:

```typescript
private startOuterRenderLoop(): void {
  if (!this.outerLens) return
  const outerAtom = this.outerLens.atom()
  this.unsubscribeOuterList = this.registry.subscribe(outerAtom, () => {
    if (this.outerMode !== "free") return
    const outerPoints = this.outerLens!.get()
    const outerSvg = buildSvgPathData(outerPoints)
    this.outerPathLine.data(outerSvg)
    this.layer.batchDraw()
  }, { immediate: true })
}
```

Call `this.startOuterRenderLoop()` at the end of the constructor.

**Step 5: Add methods for buffer distance and mode changes**

```typescript
setBufferDistance(distance: number): void {
  this.bufferDistance = distance
  if (this.outerMode === "uniform" && this.isClosed) {
    this.updatePathLine()
  }
}

setOuterMode(mode: "uniform" | "free"): void {
  this.outerMode = mode
  if (mode === "uniform" && this.isClosed) {
    this.updatePathLine() // regenerates outer from inner
  }
}
```

**Step 6: Update `updateScale` for outer path**

Add after the inner path stroke width update:
```typescript
this.outerPathLine.strokeWidth(1 / zoom)
```

**Step 7: Update `dispose` to clean up outer resources**

```typescript
this.unsubscribeOuterList?.()
this.outerPathLine.destroy()
```

**Step 8: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 4: Update canvas-atom to create masks with MaskSchema

**Files:**
- Modify: `apps/editor/src/lib/canvas-atom.ts`

**Context:** The canvas-atom currently focuses directly to `masks.focus(frameId)` which returns a `YLinkedListLens`. With `MaskSchema`, it returns a struct lens. We need to further focus to `.focus("inner")` for the inner path and `.focus("outer")` for the outer path.

**Step 1: Update `syncAllLayerPaths`**

Change the mask lens focusing:

```typescript
// OLD:
const masksLens = (root.focus("layers").focus(layerId) as any).focus("masks").focus(frameId)
const bp = new BezierPath(masksLens, pathsLayer, { ... })

// NEW:
const maskLens = (root.focus("layers").focus(layerId) as any).focus("masks").focus(frameId)
const innerLens = maskLens.focus("inner")
const outerLens = maskLens.focus("outer")
const maskData = maskLens.syncGet()
const bp = new BezierPath(innerLens, pathsLayer, {
  onSelect: () => appRegistry.set(setActivePathIdAtom, pathKey),
  color: (layerData as any).color,
  fillOpacity: 0.25,
  outerLens,
  bufferDistance: maskData?.bufferDistance ?? 20,
  outerMode: maskData?.outerMode ?? "uniform",
})
```

Apply the same pattern to `syncLayerPaths` (both the active layer mask and the other layers' masks).

**Step 2: Update drawing-mode path creation**

In the `stage.on("pointerdown")` handler where a new BezierPath is created during drawing, the mask needs to be initialized as a `MaskSchema` struct, not a bare linked list.

Before creating the BezierPath, ensure the mask struct exists:

```typescript
// Ensure mask struct exists for this frame
const maskLens = (root.focus("layers").focus(activeLayerId) as any).focus("masks").focus(currentFrameId)
const existingMask = maskLens.syncGet()
if (!existingMask) {
  // Initialize the mask struct — inner/outer will be populated by BezierPath
  maskLens.syncSet({
    inner: [],  // YLinkedList will be created
    outer: [],
    bufferDistance: 20,
    outerMode: "uniform",
  })
}

const innerLens = maskLens.focus("inner")
const outerLens = maskLens.focus("outer")
const bp = new BezierPath(innerLens, pathsLayer, {
  onSelect: () => appRegistry.set(setActivePathIdAtom, pathKey),
  color: layerData?.color,
  fillOpacity: 0.35,
  outerLens,
  bufferDistance: 20,
  outerMode: "uniform",
})
```

**Step 3: Update `getLayerMasksRecord` check**

The mask record now contains structs, not bare linked lists. The `frameId in masksRecord` check should still work since the record keys are still frame IDs.

**Step 4: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 5: Update layer-atoms for MaskSchema

**Files:**
- Modify: `apps/editor/src/lib/layer-atoms.ts`

**Context:** Several atoms read/write mask data. They need to be updated for the new struct layout.

**Step 1: Update `currentFrameHasMaskAtom`**

The check `frame.id in masks` should still work — the mask record keys are frame IDs regardless of the value type. No change needed for the `in` check.

**Step 2: Update `discardCurrentMaskAtom`**

Currently does `masksMap.delete(frame.id)` — this deletes the entire mask struct. Still correct.

**Step 3: Update `copyMaskFromPreviousAtom`**

Currently copies the bare linked list. Now needs to copy the full mask struct (inner, outer, bufferDistance, outerMode):

```typescript
entry.doc.transact(() => {
  const srcMask = entry.root
    .focus("layers").focus(activeLayerId).focus("masks").focus(prevFrame.id)
    .syncGet()

  if (srcMask) {
    ;(entry.root
      .focus("layers").focus(activeLayerId).focus("masks").focus(currFrame.id) as any)
      .syncSet(srcMask)
  }
})
```

This already copies the entire value — since `syncGet()` now returns the full `MaskSchema` struct, and `syncSet()` writes it to the new frame key. **No change needed.**

**Step 4: Update `createLayerAtom` and `duplicateLayerAtom`**

These set `masks: {}` for new/copied layers. Since the masks record now expects `MaskSchema` values, an empty record is still valid. **No change needed.**

**Step 5: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 6: Add inner/outer toggle and buffer controls to canvas bar

**Files:**
- Modify: `apps/editor/src/components/canvas-bar.tsx`

**Context:** When the user is in editing mode on a frame that has a closed mask, the canvas bar needs:
- Inner/Outer toggle (which path is being edited)
- Buffer distance slider (only in uniform mode)
- Mode dropdown: Uniform / Free Edit

**Step 1: Add editing-target atom**

In `apps/editor/src/lib/layer-atoms.ts`, add a module-level atom for which path the user is editing:

```typescript
/** Which mask path is being edited: "inner" or "outer" */
export const editingPathTargetAtom = Atom.make<"inner" | "outer">("inner")
```

**Step 2: Add buffer distance atom**

This reads/writes the `bufferDistance` from the current mask in the Y.Doc:

```typescript
/** Read the buffer distance of the active mask on the current frame */
export const maskBufferDistanceAtom = Atom.make((get): number => {
  const layerIdResult = get(activeLayerIdAtom)
  if (!Result.isSuccess(layerIdResult) || !layerIdResult.value) return 20

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return 20
  const layer = layersResult.value.find((l) => l.id === layerIdResult.value)
  if (!layer) return 20

  const framesResult = get(framesAtom)
  if (!Result.isSuccess(framesResult)) return 20
  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(currentResult)) return 20
  const frame = framesResult.value[currentResult.value as number]
  if (!frame) return 20

  const masks = (layer as any).masks ?? {}
  const mask = masks[frame.id]
  return mask?.bufferDistance ?? 20
})
```

**Step 3: Update canvas bar editing state**

When `hasMask && !isDrawing`, add the inner/outer controls after the existing mask tools:

```tsx
{hasMask && (
  <>
    <span className="text-border">|</span>
    <div className="flex items-center gap-1">
      <Button
        variant={editingTarget === "inner" ? "secondary" : "ghost"}
        size="sm" className="h-6 px-2 text-xs"
        onClick={() => setEditingTarget("inner")}
      >
        Inner
      </Button>
      <Button
        variant={editingTarget === "outer" ? "secondary" : "ghost"}
        size="sm" className="h-6 px-2 text-xs"
        onClick={() => setEditingTarget("outer")}
      >
        Outer
      </Button>
    </div>
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      Buffer:
      <input
        type="range"
        min="5" max="100" step="1"
        value={bufferDistance}
        onChange={(e) => updateBufferDistance(Number(e.target.value))}
        className="w-16 h-1 accent-muted-foreground"
      />
      <span className="tabular-nums w-6">{bufferDistance}</span>
    </label>
  </>
)}
```

**Step 4: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 7: Migration for existing mask data

**Files:**
- Modify: `apps/editor/src/lib/project-doc-atoms.ts`

**Context:** Existing projects have masks stored as bare `YLinkedList` values under the `masks` Y.Map. The new schema expects `MaskSchema` structs. We need to migrate on load.

**Step 1: Add migration logic**

Before `YDocument.bind`, after Y.Doc hydration, check if any mask entries are bare linked lists and wrap them:

```typescript
// Migrate old masks (bare YLinkedList → MaskSchema struct)
const rootMap_ = doc.getMap("root")
const layersMap = rootMap_.get("layers") as Y.Map<any> | undefined
if (layersMap instanceof Y.Map) {
  doc.transact(() => {
    layersMap.forEach((layerMap: any) => {
      const masksMap = layerMap instanceof Y.Map ? layerMap.get("masks") : null
      if (!(masksMap instanceof Y.Map)) return
      masksMap.forEach((maskValue: any, frameId: string) => {
        // If the mask value is a Y.Map with "_head" key, it's a bare YLinkedList — migrate it
        if (maskValue instanceof Y.Map && maskValue.has("_head") && !maskValue.has("inner")) {
          // This is a bare YLinkedList, not a MaskSchema struct
          // We can't easily restructure in-place, so we'll let focus() handle lazy creation
          // For now, mark it for the new schema to handle
        }
      })
    })
  })
}
```

Actually, the simplest migration: since `focus()` lazily creates missing struct fields, the existing bare linked list data will fail to parse as `MaskSchema`. The safest approach is to **clear old mask data** on projects with the old schema, since this is a development-time migration (no production data yet).

```typescript
// Development migration: clear incompatible old mask data
const rootMap_ = doc.getMap("root")
const layersMap = rootMap_.get("layers")
if (layersMap instanceof Y.Map) {
  layersMap.forEach((layerMap: any) => {
    if (layerMap instanceof Y.Map) {
      const masksMap = layerMap.get("masks")
      if (masksMap instanceof Y.Map && masksMap.size > 0) {
        // Check if first entry is old format (bare linked list, has "_head")
        const firstEntry = masksMap.values().next().value
        if (firstEntry instanceof Y.Map && firstEntry.has("_head") && !firstEntry.has("inner")) {
          masksMap.clear() // Clear old format masks
        }
      }
    }
  })
}
```

Add this before the `YDocument.bind` call.

**Step 2: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 8: Final integration and typecheck

**Files:**
- All modified files

**Step 1: Run full typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

**Step 2: Run build**

```bash
npx turbo build --filter=@nur/editor
```

**Step 3: Visual verification checklist**

- [ ] Drawing a closed path shows a filled inner region
- [ ] After closing, an outer dashed path appears at ~20px buffer distance
- [ ] Editing inner points auto-updates outer path (uniform mode)
- [ ] Canvas bar shows Inner/Outer toggle and buffer slider when mask exists
- [ ] Switching to "Free Edit" mode freezes outer, allows independent editing
- [ ] Switching back to "Uniform" regenerates outer from inner
- [ ] Buffer slider adjusts the outer path distance in real-time
- [ ] Copy from Previous copies both inner and outer paths
- [ ] Viewing mode shows only inner fill, no outer dashed line
- [ ] Existing projects with old mask format are cleared cleanly
