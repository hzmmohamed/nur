# Bezier Tool Interactions Design

**Goal:** Upgrade the pen tool from click-based to pointer-event-based interactions with hover feedback, drag-to-set-handles on point creation, and ghost vertex preview on edge hover.

**Current state:** Points are added via `stage.on("click")`, no hover states exist on paths/vertices/handles, and edge insertion is click-only with no preview.

---

## 1. Pointerdown-to-Drag Point Creation

Replace the `stage.on("click")` handler in `canvas-atom.ts` with a three-event gesture: `pointerdown` + `pointermove` + `pointerup`.

**Pointerdown (pen tool active, click hits empty canvas):**
- Append a new point at cursor position with zero-length handles
- Store ephemeral gesture state as local variables in `canvas-atom.ts`:
  - `dragOrigin: {x, y} | null` — cursor position at pointerdown
  - `newPointId: string | null` — the ID returned by `appendPoint()`
  - `isDraggingNewHandle: boolean` — becomes true after 3px drag threshold

**Pointermove (while held):**
- If `newPointId` is set and drag exceeds 3px from `dragOrigin`:
  - Set `isDraggingNewHandle = true`
  - Compute polar angle/distance from point position to current cursor
  - Write `handleOutAngle` and `handleOutDistance` to the point's lens
  - Mirror to `handleInAngle` (opposite direction) and `handleInDistance` (same distance)
  - The existing reactive Yjs->Konva subscription updates the handle visuals automatically

**Pointerup:**
- Clear `dragOrigin`, `newPointId`, `isDraggingNewHandle`
- If no drag occurred, point keeps zero-length handles (sharp corner)

---

## 2. Ghost Vertex on Active Path Edge

**Konva object:** One shared `Konva.Circle` per `BezierPath` instance, created in the constructor alongside `pathLine`. Hidden by default. Style: same radius as `POINT_RADIUS`, fill `POINT_COLOR` at 0.4 opacity, no stroke. `listening: false` — the pathLine is the click target.

**Tracking state:** `BezierPath` stores:
- `ghostVertex: Konva.Circle`
- `ghostSplitResult: ReturnType<typeof findNearestPointOnPath> | null` — cached so pointerdown can use it

**pathLine pointermove (active path only):**
- Call `findNearestPointOnPath(points, pos.x, pos.y, HIT_TOLERANCE, ids)`
- If result found: position ghost vertex at `result.point.x, result.point.y`, show it, cache result
- If not found: hide ghost vertex, clear cache

**pathLine pointerleave:**
- Hide ghost vertex, clear cached result

**pathLine pointerdown (active path):**
- If `ghostSplitResult` is cached: perform de Casteljau insertion using cached result (same logic as current `handlePathClick`, but using the cached `ghostSplitResult` instead of recomputing)
- Cancel bubble to prevent stage pointerdown from also firing

**On inactive paths:** Ghost vertex is hidden, pointermove does nothing for ghost.

---

## 3. Path Hover State (Inactive Paths)

**pathLine pointerenter (inactive path):**
- Change stroke to a highlight color (e.g., `PATH_COLOR` white, brighter than the `PATH_COLOR_INACTIVE` gray)
- Set `stage.container().style.cursor = "pointer"`

**pathLine pointerleave (inactive path):**
- Restore stroke to `PATH_COLOR_INACTIVE`
- Reset `stage.container().style.cursor = "default"`

**pathLine pointerdown (inactive path):**
- Call `onSelect()` — same as current click behavior, replacing `click` with `pointerdown`
- Cancel bubble

---

## 4. Vertex and Handle Hover States (Active Path)

**Constants:**
- `POINT_COLOR_HOVER = "#6BB0F0"` (lighter blue)
- `HANDLE_COLOR_HOVER = "#F0A060"` (lighter orange)

**pointCircle pointerenter:**
- Change fill to `POINT_COLOR_HOVER`
- Set `stage.container().style.cursor = "move"`

**pointCircle pointerleave:**
- Restore fill to `POINT_COLOR`
- Reset `stage.container().style.cursor = "default"`

**handleInCircle / handleOutCircle pointerenter:**
- Change fill to `HANDLE_COLOR_HOVER`
- Set `stage.container().style.cursor = "move"`

**handleInCircle / handleOutCircle pointerleave:**
- Restore fill to `HANDLE_COLOR`
- Reset `stage.container().style.cursor = "default"`

---

## 5. Hit Area Buffers

All interactive targets get a `hitStrokeWidth` for forgiving click/hover targets:

| Target | Visible size | `hitStrokeWidth` | Total hit area |
|--------|-------------|-------------------|----------------|
| `pathLine` | 2px stroke | 20px (existing) | ~22px zone |
| `pointCircle` | 6px radius | 6px | ~9px radius zone |
| `handleInCircle` | 4px radius | 6px | ~7px radius zone |
| `handleOutCircle` | 4px radius | 6px | ~7px radius zone |

---

## 6. Event Migration Summary

### `canvas-atom.ts` (stage-level)

| Before | After |
|--------|-------|
| `stage.on("click")` | `stage.on("pointerdown")` + `stage.on("pointermove")` + `stage.on("pointerup")` |

### `bezier-curve.ts` (BezierPath)

| Target | Before | After |
|--------|--------|-------|
| `pathLine` click (active) | `click` -> `handlePathClick` | `pointerdown` -> insert via cached ghost result |
| `pathLine` click (inactive) | `click` -> `onSelect()` | `pointerdown` -> `onSelect()` |
| `pathLine` hover | (none) | `pointerenter`/`pointerleave` -> stroke highlight + cursor |
| `pathLine` ghost | (none) | `pointermove` -> position ghost vertex |
| `pointCircle` hover | (none) | `pointerenter`/`pointerleave` -> fill highlight + cursor |
| `pointCircle` click | `click` -> cancel bubble | `pointerdown` -> cancel bubble |
| `handleIn/Out` hover | (none) | `pointerenter`/`pointerleave` -> fill highlight + cursor |
| `handleIn/Out` click | `click` -> cancel bubble | `pointerdown` -> cancel bubble |

---

## 7. Files Changed

| File | Changes |
|------|---------|
| `apps/editor/src/lib/canvas-atom.ts` | Replace `stage.on("click")` with pointerdown/move/up gesture; add local gesture state vars |
| `apps/editor/src/lib/canvas-objects/bezier-curve.ts` | Add ghost vertex, hover states, replace click events with pointer events, add `hitStrokeWidth` to circles |
