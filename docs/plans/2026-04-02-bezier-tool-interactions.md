# Bezier Tool Interactions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade pen tool from click-based to pointer-event-based interactions with hover feedback, drag-to-set-handles, and ghost vertex preview.

**Architecture:** Two files change. `bezier-curve.ts` gains hover states (path, vertex, handle), a ghost vertex circle, and migrates all `click` events to `pointerdown`. `canvas-atom.ts` replaces its `stage.on("click")` with a pointerdown/pointermove/pointerup gesture that supports drag-to-set-handles on new points.

**Tech Stack:** Konva.js (imperative canvas), effect-yjs (YLinkedListLens), @effect-atom/atom (Registry)

**Design doc:** `docs/plans/2026-04-02-bezier-tool-interactions-design.md`

---

### Task 1: Add hover states and hit buffers to BezierPath

**Files:**
- Modify: `apps/editor/src/lib/canvas-objects/bezier-curve.ts`

This task adds hover visual feedback to vertices, handles, and path lines, plus hit area buffers on circles. No behavioral changes yet — just visual feedback on pointer enter/leave.

**Step 1: Add hover color constants**

Add after the existing constants (line 21, after `HIT_TOLERANCE`):

```ts
const POINT_COLOR_HOVER = "#6BB0F0"
const HANDLE_COLOR_HOVER = "#F0A060"
const POINT_HIT_BUFFER = 6
const HANDLE_HIT_BUFFER = 6
```

**Step 2: Add `hitStrokeWidth` to point and handle circles**

In `createPointObjects()`, update the circle constructors:

`handleInCircle` — add `hitStrokeWidth: HANDLE_HIT_BUFFER`:
```ts
const handleInCircle = new Konva.Circle({
  radius: HANDLE_RADIUS,
  fill: HANDLE_COLOR,
  draggable: true,
  visible: false,
  hitStrokeWidth: HANDLE_HIT_BUFFER,
})
```

`handleOutCircle` — same:
```ts
const handleOutCircle = new Konva.Circle({
  radius: HANDLE_RADIUS,
  fill: HANDLE_COLOR,
  draggable: true,
  visible: false,
  hitStrokeWidth: HANDLE_HIT_BUFFER,
})
```

`pointCircle` — add `hitStrokeWidth: POINT_HIT_BUFFER`:
```ts
const pointCircle = new Konva.Circle({
  radius: POINT_RADIUS,
  fill: POINT_COLOR,
  stroke: "#FFFFFF",
  strokeWidth: 1,
  draggable: true,
  hitStrokeWidth: POINT_HIT_BUFFER,
})
```

**Step 3: Add hover handlers to pointCircle**

After the existing `pointCircle.on("click", ...)` handler (line 222), add:

```ts
pointCircle.on("pointerenter", () => {
  pointCircle.fill(POINT_COLOR_HOVER)
  const s = this.layer.getStage()
  if (s) s.container().style.cursor = "move"
  this.layer.batchDraw()
})
pointCircle.on("pointerleave", () => {
  pointCircle.fill(POINT_COLOR)
  const s = this.layer.getStage()
  if (s) s.container().style.cursor = "default"
  this.layer.batchDraw()
})
```

**Step 4: Add hover handlers to handle circles**

After the `handleInCircle.on("click", ...)` handler (line 223), add:

```ts
handleInCircle.on("pointerenter", () => {
  handleInCircle.fill(HANDLE_COLOR_HOVER)
  const s = this.layer.getStage()
  if (s) s.container().style.cursor = "move"
  this.layer.batchDraw()
})
handleInCircle.on("pointerleave", () => {
  handleInCircle.fill(HANDLE_COLOR)
  const s = this.layer.getStage()
  if (s) s.container().style.cursor = "default"
  this.layer.batchDraw()
})
```

Same pattern for `handleOutCircle` after its click handler (line 224):

```ts
handleOutCircle.on("pointerenter", () => {
  handleOutCircle.fill(HANDLE_COLOR_HOVER)
  const s = this.layer.getStage()
  if (s) s.container().style.cursor = "move"
  this.layer.batchDraw()
})
handleOutCircle.on("pointerleave", () => {
  handleOutCircle.fill(HANDLE_COLOR)
  const s = this.layer.getStage()
  if (s) s.container().style.cursor = "default"
  this.layer.batchDraw()
})
```

**Step 5: Add hover handlers to pathLine for inactive paths**

In the constructor, replace the existing `pathLine.on("click", ...)` handler (lines 67-74) with:

```ts
this.pathLine.on("pointerenter", () => {
  if (!this.active) {
    this.pathLine.stroke(PATH_COLOR)
    const s = this.layer.getStage()
    if (s) s.container().style.cursor = "pointer"
    this.layer.batchDraw()
  }
})
this.pathLine.on("pointerleave", () => {
  if (!this.active) {
    this.pathLine.stroke(PATH_COLOR_INACTIVE)
    const s = this.layer.getStage()
    if (s) s.container().style.cursor = "default"
    this.layer.batchDraw()
  }
  // Also hide ghost vertex (added in Task 2)
})
```

Don't add the pointerdown handler yet — that's Task 2.

**Step 6: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json 2>&1 | head -40`

**Step 7: Commit**

```
feat(editor): add hover states and hit buffers to bezier path vertices and handles
```

---

### Task 2: Add ghost vertex and migrate pathLine events to pointerdown

**Files:**
- Modify: `apps/editor/src/lib/canvas-objects/bezier-curve.ts`

This task adds the ghost vertex circle for edge-insertion preview and migrates all pathLine click events to pointerdown.

**Step 1: Add ghost vertex fields to the class**

Add to the private fields (after `private readonly onSelect?: () => void` on line 48):

```ts
private readonly ghostVertex: Konva.Circle
private ghostSplitResult: ReturnType<typeof findNearestPointOnPath> | null = null
```

**Step 2: Create ghost vertex in constructor**

After `this.layer.add(this.pathLine)` (line 64), add:

```ts
this.ghostVertex = new Konva.Circle({
  radius: POINT_RADIUS,
  fill: POINT_COLOR,
  opacity: 0.4,
  visible: false,
  listening: false,
})
this.layer.add(this.ghostVertex)
```

**Step 3: Add pointermove handler to pathLine for ghost vertex**

Add after the pointerenter/pointerleave handlers from Task 1:

```ts
this.pathLine.on("pointermove", () => {
  if (!this.active) return
  const stage = this.layer.getStage()
  if (!stage) return
  const pos = stage.getPointerPosition()
  if (!pos) return

  const points = this.lens.get()
  const nodesMap = this.lens.nodes()
  const ids = Array.from(nodesMap.keys())

  const result = findNearestPointOnPath(points, pos.x, pos.y, HIT_TOLERANCE, ids)
  if (result) {
    this.ghostVertex.position({ x: result.point.x, y: result.point.y })
    this.ghostVertex.visible(true)
    this.ghostSplitResult = result
    const s = this.layer.getStage()
    if (s) s.container().style.cursor = "copy"
  } else {
    this.ghostVertex.visible(false)
    this.ghostSplitResult = null
  }
  this.layer.batchDraw()
})
```

**Step 4: Update pointerleave handler to hide ghost vertex**

In the `pointerleave` handler added in Task 1, add ghost cleanup:

```ts
this.pathLine.on("pointerleave", () => {
  if (!this.active) {
    this.pathLine.stroke(PATH_COLOR_INACTIVE)
  }
  this.ghostVertex.visible(false)
  this.ghostSplitResult = null
  const s = this.layer.getStage()
  if (s) s.container().style.cursor = "default"
  this.layer.batchDraw()
})
```

**Step 5: Add pointerdown handler to pathLine**

This replaces the old `click` handler. Add after the pointermove handler:

```ts
this.pathLine.on("pointerdown", (e) => {
  e.cancelBubble = true
  if (!this.active && this.onSelect) {
    this.onSelect()
  } else if (this.active && this.ghostSplitResult) {
    this.insertPointFromGhost()
  }
})
```

**Step 6: Replace handlePathClick with insertPointFromGhost**

Replace the `handlePathClick()` method (lines 294-322) with:

```ts
/** Insert a new point using the cached ghost vertex split result */
private insertPointFromGhost(): void {
  const result = this.ghostSplitResult
  if (!result) return

  const nodesMap = this.lens.nodes()
  const ids = Array.from(nodesMap.keys())

  // Update the neighbor handles
  const prevLens = this.lens.find(result.afterId)
  prevLens.focus("handleOutAngle").syncSet(result.updatedPrevHandleOut.angle)
  prevLens.focus("handleOutDistance").syncSet(result.updatedPrevHandleOut.distance)

  const afterIdx = ids.indexOf(result.afterId)
  if (afterIdx >= 0 && afterIdx < ids.length - 1) {
    const nextId = ids[afterIdx + 1]
    const nextLens = this.lens.find(nextId)
    nextLens.focus("handleInAngle").syncSet(result.updatedNextHandleIn.angle)
    nextLens.focus("handleInDistance").syncSet(result.updatedNextHandleIn.distance)
  }

  this.lens.insertAfter(result.afterId, result.point)

  // Clear ghost state
  this.ghostVertex.visible(false)
  this.ghostSplitResult = null
}
```

**Step 7: Migrate bubble cancellation from click to pointerdown**

Replace the three `click` cancel-bubble handlers in `createPointObjects` (lines 222-224):

```ts
// Before:
pointCircle.on("click", (e) => { e.cancelBubble = true })
handleInCircle.on("click", (e) => { e.cancelBubble = true })
handleOutCircle.on("click", (e) => { e.cancelBubble = true })

// After:
pointCircle.on("pointerdown", (e) => { e.cancelBubble = true })
handleInCircle.on("pointerdown", (e) => { e.cancelBubble = true })
handleOutCircle.on("pointerdown", (e) => { e.cancelBubble = true })
```

**Step 8: Destroy ghost vertex in dispose()**

In the `dispose()` method, add before `this.pathLine.destroy()`:

```ts
this.ghostVertex.destroy()
```

**Step 9: Hide ghost vertex when path becomes inactive**

In `setActive()`, add after the `HashMap.forEach` block:

```ts
if (!active) {
  this.ghostVertex.visible(false)
  this.ghostSplitResult = null
}
```

**Step 10: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json 2>&1 | head -40`

**Step 11: Commit**

```
feat(editor): add ghost vertex preview and migrate pathLine to pointer events
```

---

### Task 3: Replace stage click with pointerdown-to-drag gesture

**Files:**
- Modify: `apps/editor/src/lib/canvas-atom.ts`

This task replaces `stage.on("click")` with a three-event gesture that supports drag-to-set-handles when creating new points.

**Step 1: Add gesture state variables**

After `let currentFrameId: string | null = null` (line 46), add:

```ts
// -- Pointer gesture state for pen tool --
let dragOrigin: { x: number; y: number } | null = null
let newPointId: string | null = null
let isDraggingNewHandle = false
const DRAG_THRESHOLD = 3
```

**Step 2: Replace stage.on("click") with pointerdown**

Replace the entire `stage.on("click", ...)` block (lines 211-237) with:

```ts
// -- Stage pointer handlers for pen tool --
stage.on("pointerdown", () => {
  const tool = getActiveTool()
  if (tool !== "pen") return

  const pos = stage.getPointerPosition()
  if (!pos) return

  let pathId = getActivePathId()
  if (!pathId) {
    if (!currentFrameId) return
    const pathsLens = (root.focus("frames").focus(currentFrameId) as any).focus("paths")
    pathId = crypto.randomUUID()
    const pathLens = pathsLens.focus(pathId)
    const bp = new BezierPath(pathLens, pathsLayer, {
      onSelect: () => appRegistry.set(setActivePathIdAtom, pathId!),
    })
    bp.setActive(true)
    MutableHashMap.set(paths, pathId, bp)
    appRegistry.set(setActivePathIdAtom, pathId)
    pathsLayer.moveToTop()
  }

  const bp = MutableHashMap.get(paths, pathId)
  if (bp._tag === "Some") {
    const id = bp.value.appendPoint(pos.x, pos.y)
    dragOrigin = { x: pos.x, y: pos.y }
    newPointId = id
    isDraggingNewHandle = false
  }
})

stage.on("pointermove", () => {
  if (!dragOrigin || !newPointId) return

  const pos = stage.getPointerPosition()
  if (!pos) return

  const dx = pos.x - dragOrigin.x
  const dy = pos.y - dragOrigin.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (!isDraggingNewHandle && dist < DRAG_THRESHOLD) return
  isDraggingNewHandle = true

  // Get the active path and update the new point's handles
  const pathId = getActivePathId()
  if (!pathId || !currentFrameId) return

  const pathsLens = (root.focus("frames").focus(currentFrameId) as any).focus("paths")
  const pathLens = pathsLens.focus(pathId)
  const nodeLens = pathLens.find(newPointId)

  // handleOut points from origin toward cursor
  const angle = Math.atan2(dy, dx)
  nodeLens.focus("handleOutAngle").syncSet(angle)
  nodeLens.focus("handleOutDistance").syncSet(dist)
  // Mirror: handleIn points opposite direction, same distance
  nodeLens.focus("handleInAngle").syncSet(angle + Math.PI)
  nodeLens.focus("handleInDistance").syncSet(dist)
})

stage.on("pointerup", () => {
  dragOrigin = null
  newPointId = null
  isDraggingNewHandle = false
})
```

**Step 3: Verify typecheck**

Run: `cd /home/hfahmi/work/freelance/nur && npx tsc --noEmit -p apps/editor/tsconfig.app.json 2>&1 | head -40`

**Step 4: Commit**

```
feat(editor): replace click with pointerdown-to-drag gesture for pen tool
```

---

### Task 4: Manual smoke test and fixes

**Step 1: Start dev server**

Run: `cd /home/hfahmi/work/freelance/nur && pnpm dev`

**Step 2: Test hover states**

1. Open a project with frames
2. Switch to Pen tool (P key)
3. Create a path with 3+ points
4. Hover over a vertex point — should turn lighter blue, cursor becomes `move`
5. Hover over a handle circle — should turn lighter orange, cursor becomes `move`
6. Leave hover — colors restore, cursor resets
7. Press Escape to deselect path
8. Hover over the inactive path line — should brighten from gray to white, cursor becomes `pointer`
9. Leave — restores to gray

**Step 3: Test pointerdown-to-drag**

1. Switch to Pen tool
2. Click empty canvas — point appears (no drag = zero handles)
3. Pointerdown on canvas and drag — point appears, handle grows as you drag, mirrored handle appears
4. Release — handles stay at the set angle/distance
5. Add more points with drag — curves form naturally

**Step 4: Test ghost vertex**

1. Create a path with 2+ points
2. Hover over the path line (between points) — ghost vertex appears on the curve, cursor becomes `copy`
3. Move cursor along the path — ghost follows the curve
4. Move cursor away — ghost disappears
5. Click on path line where ghost is visible — new point inserted, curve shape preserved
6. Verify the neighboring handles were updated correctly

**Step 5: Test edge cases**

1. Switch tools while dragging (shouldn't crash)
2. Pointerdown on a point (not canvas) — should drag the point, not create a new one
3. Click inactive path — should select it (pointerdown fires)
4. Ghost vertex should NOT appear on inactive paths
5. Switch frames — ghost should disappear, paths should update

**Step 6: Fix any issues found, commit**

```
fix(editor): address bezier tool interaction issues from smoke test
```
