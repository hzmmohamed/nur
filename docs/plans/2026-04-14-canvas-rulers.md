# Canvas Rulers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render pixel rulers on the frame canvas edges (X top, Y left) as Konva layers, showing absolute frame coordinates and per-layer mask projection spans.

**Architecture:** A dedicated `rulersLayer` Konva layer is added inside `canvasAtom` (canvas-atom.ts), positioned above `imageLayer` but below `pathsLayer`. The rulers redraw on every zoom/pan/frame-change and also whenever mask points change. A helper module `canvas-rulers.ts` encapsulates all ruler drawing logic to keep canvas-atom clean.

**Tech Stack:** Konva.js (shapes/lines/text), effect-atom (reactive subscriptions), existing `stagePositionAtom`, `zoomAtom`, `zoomRawAtom`, `stageSizeAtom` from viewport-atoms and canvas-minimap.

---

### Task 1: Create the ruler drawing helper module

**Files:**
- Create: `apps/editor/src/lib/canvas-objects/canvas-rulers.ts`

This module exports a single `drawRulers` function that takes all required inputs and redraws the rulers layer from scratch.

**Step 1: Create the file with the drawRulers function**

```typescript
// apps/editor/src/lib/canvas-objects/canvas-rulers.ts
import Konva from "konva"

export interface LayerProjection {
  color: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface RulerDrawOptions {
  layer: Konva.Layer
  frameWidth: number
  frameHeight: number
  /** image offset in stage coords (where frame top-left is on screen) */
  frameOffsetX: number
  frameOffsetY: number
  zoom: number
  /** per-layer bounding box projections in frame pixel coords */
  projections: LayerProjection[]
}

const RULER_THICKNESS = 20   // screen pixels
const RULER_BG = "rgba(20,20,20,0.72)"
const TICK_COLOR = "rgba(255,255,255,0.8)"
const TICK_COLOR_MINOR = "rgba(255,255,255,0.35)"
const LABEL_COLOR = "rgba(255,255,255,0.75)"
const LABEL_FONT_SIZE = 10
const SPAN_HEIGHT = 6          // screen pixels
const SPAN_OPACITY = 0.55

/** Choose tick interval (in frame pixels) based on zoom */
function tickInterval(zoom: number): { major: number; minor: number } {
  if (zoom < 0.3) return { major: 500, minor: 100 }
  if (zoom < 0.6) return { major: 200, minor: 50 }
  if (zoom < 1.2) return { major: 100, minor: 20 }
  if (zoom < 2.5) return { major: 50,  minor: 10 }
  return { major: 20, minor: 5 }
}

export function drawRulers(opts: RulerDrawOptions): void {
  const { layer, frameWidth, frameHeight, frameOffsetX, frameOffsetY, zoom, projections } = opts
  layer.destroyChildren()

  const inv = 1 / zoom
  const rulerThick = RULER_THICKNESS * inv
  const spanH = SPAN_HEIGHT * inv
  const fontSize = LABEL_FONT_SIZE * inv
  const { major, minor } = tickInterval(zoom)

  // ── X ruler (horizontal, top of frame) ──────────────────────────────────

  // Background rect
  layer.add(new Konva.Rect({
    x: frameOffsetX,
    y: frameOffsetY - rulerThick,
    width: frameWidth,
    height: rulerThick,
    fill: RULER_BG,
    listening: false,
  }))

  // Projection spans
  for (const proj of projections) {
    if (proj.xMax <= proj.xMin) continue
    const spanY = frameOffsetY - rulerThick + (rulerThick - spanH) / 2
    layer.add(new Konva.Rect({
      x: frameOffsetX + proj.xMin,
      y: spanY,
      width: proj.xMax - proj.xMin,
      height: spanH,
      fill: proj.color,
      opacity: SPAN_OPACITY,
      listening: false,
    }))
  }

  // Ticks
  for (let px = 0; px <= frameWidth; px += minor) {
    const isMajor = px % major === 0
    const tickH = isMajor ? rulerThick * 0.55 : rulerThick * 0.28
    const x = frameOffsetX + px
    layer.add(new Konva.Line({
      points: [x, frameOffsetY - tickH, x, frameOffsetY],
      stroke: isMajor ? TICK_COLOR : TICK_COLOR_MINOR,
      strokeWidth: inv,
      listening: false,
    }))
    if (isMajor && px > 0) {
      layer.add(new Konva.Text({
        x: x + 2 * inv,
        y: frameOffsetY - rulerThick + 2 * inv,
        text: String(px),
        fontSize,
        fill: LABEL_COLOR,
        listening: false,
      }))
    }
  }

  // ── Y ruler (vertical, left of frame) ────────────────────────────────────

  // Background rect
  layer.add(new Konva.Rect({
    x: frameOffsetX - rulerThick,
    y: frameOffsetY,
    width: rulerThick,
    height: frameHeight,
    fill: RULER_BG,
    listening: false,
  }))

  // Projection spans
  for (const proj of projections) {
    if (proj.yMax <= proj.yMin) continue
    const spanX = frameOffsetX - rulerThick + (rulerThick - spanH) / 2
    layer.add(new Konva.Rect({
      x: spanX,
      y: frameOffsetY + proj.yMin,
      width: spanH,
      height: proj.yMax - proj.yMin,
      fill: proj.color,
      opacity: SPAN_OPACITY,
      listening: false,
    }))
  }

  // Ticks + labels
  for (let py = 0; py <= frameHeight; py += minor) {
    const isMajor = py % major === 0
    const tickW = isMajor ? rulerThick * 0.55 : rulerThick * 0.28
    const y = frameOffsetY + py
    layer.add(new Konva.Line({
      points: [frameOffsetX - tickW, y, frameOffsetX, y],
      stroke: isMajor ? TICK_COLOR : TICK_COLOR_MINOR,
      strokeWidth: inv,
      listening: false,
    }))
    if (isMajor && py > 0) {
      // Rotated label — draw then rotate around anchor point
      const label = new Konva.Text({
        x: frameOffsetX - rulerThick + 2 * inv,
        y,
        text: String(py),
        fontSize,
        fill: LABEL_COLOR,
        listening: false,
        rotation: -90,
      })
      // Offset so it reads top→bottom
      label.offsetX(label.width())
      layer.add(label)
    }
  }

  layer.batchDraw()
}
```

**Step 2: No test needed** — this is a pure drawing function with no logic to unit-test independently. It will be verified visually after integration.

**Step 3: Commit**

```bash
git add apps/editor/src/lib/canvas-objects/canvas-rulers.ts
git commit -m "feat: add drawRulers helper for Konva ruler layer"
```

---

### Task 2: Add rulerLayer + frame offset tracking to canvasAtom

**Files:**
- Modify: `apps/editor/src/lib/canvas-atom.ts`

The canvas-atom already tracks `currentFrameWidth`, `currentFrameHeight`, and computes image offset in `updateImageTransform`. We need to:
1. Create a `rulersLayer` Konva layer
2. Track `frameOffsetX` / `frameOffsetY` (already computed implicitly in `updateImageTransform`)
3. Expose a `redrawRulers()` function that collects mask projections and calls `drawRulers`
4. Call `redrawRulers()` whenever zoom, pan, frame, or paths change

**Step 1: Import drawRulers at the top of canvas-atom.ts**

In `apps/editor/src/lib/canvas-atom.ts`, after the existing imports add:

```typescript
import { drawRulers, type LayerProjection } from "./canvas-objects/canvas-rulers"
```

**Step 2: Add rulersLayer after pathsLayer creation** (~line 44)

```typescript
  const rulersLayer = new Konva.Layer()
  stage.add(imageLayer)
  stage.add(rulersLayer)   // ← add this
  stage.add(pathsLayer)
```

**Step 3: Add frame offset tracking variables** (after the `let currentFrameHeight = 1` line, ~line 80)

```typescript
  let frameOffsetX = 0
  let frameOffsetY = 0
```

**Step 4: Capture offsets in updateImageTransform** — update the function to store offsets after computing them:

```typescript
  function updateImageTransform() {
    if (!konvaImage) return
    const scale = Math.min(
      stage.width() / currentFrameWidth,
      stage.height() / currentFrameHeight,
    )
    const scaledW = currentFrameWidth * scale
    const scaledH = currentFrameHeight * scale
    konvaImage.width(scaledW)
    konvaImage.height(scaledH)
    konvaImage.x((stage.width() - scaledW) / 2)
    konvaImage.y((stage.height() - scaledH) / 2)
    frameOffsetX = (stage.width() - scaledW) / 2
    frameOffsetY = (stage.height() - scaledH) / 2
    imageLayer.batchDraw()
  }
```

**Step 5: Add collectProjections helper function** (add after `getActiveTool`, ~line 267):

```typescript
  function collectProjections(): LayerProjection[] {
    if (!currentFrameId) return []
    const layersRecord = (root.focus("layers").syncGet() ?? {}) as Record<string, any>
    const result: LayerProjection[] = []
    for (const [layerId, layerData] of Object.entries(layersRecord)) {
      const frameMasks = getFrameMasks(layerId, currentFrameId)
      if (!frameMasks) continue
      let xMin = Infinity, xMax = -Infinity
      let yMin = Infinity, yMax = -Infinity
      for (const maskId of Object.keys(frameMasks)) {
        try {
          const innerLens = (root.focus("layers").focus(layerId) as any)
            .focus("masks").focus(currentFrameId).focus(maskId).focus("inner")
          const points = innerLens.get() as Array<{ x: number; y: number }> | undefined
          if (!points) continue
          for (const pt of points) {
            if (pt.x < xMin) xMin = pt.x
            if (pt.x > xMax) xMax = pt.x
            if (pt.y < yMin) yMin = pt.y
            if (pt.y > yMax) yMax = pt.y
          }
        } catch { /* skip if lens not yet available */ }
      }
      if (xMin !== Infinity) {
        result.push({
          color: (layerData as any).color ?? "#888",
          xMin,
          xMax,
          yMin,
          yMax,
        })
      }
    }
    return result
  }
```

**Step 6: Add redrawRulers function** (add right after `collectProjections`):

```typescript
  function redrawRulers() {
    const zoom = (() => {
      const r = appRegistry.get(zoomAtom) as any
      return r?._tag === "Success" ? r.value : 1
    })()
    drawRulers({
      layer: rulersLayer,
      frameWidth: currentFrameWidth,
      frameHeight: currentFrameHeight,
      frameOffsetX,
      frameOffsetY,
      zoom,
      projections: collectProjections(),
    })
  }
```

**Step 7: Call redrawRulers in all relevant subscriptions**

Find the zoom subscription (~line 320) and append `redrawRulers()`:
```typescript
  get.subscribe(zoomAtom, (zoomResult) => {
    const zoom = zoomResult._tag === "Success" ? zoomResult.value : 1
    // ... existing code ...
    stage.batchDraw()
    redrawRulers()   // ← add
  })
```

Find the pan handler `handlePanMove` (~line 575) and append after `stage.batchDraw()`:
```typescript
    stage.batchDraw()
    redrawRulers()   // ← add
```

Find `applyFrame` (~line 270) and call at the end:
```typescript
  function applyFrame(frameData: Frame | undefined) {
    // ...existing code...
    pathsLayer.batchDraw()
    redrawRulers()   // ← add
  }
```

Find the `currentFrameMaskCountAtom` subscription (~line 352) and append:
```typescript
  get.subscribe(currentFrameMaskCountAtom, () => {
    if (currentFrameId) {
      syncPaths(currentFrameId)
      redrawRulers()   // ← add
    }
  })
```

Also call `redrawRulers()` in the ResizeObserver callback after `updateImageTransform()`:
```typescript
  const resizeObserver = new ResizeObserver((entries) => {
    // ...existing code...
    updateImageTransform()
    redrawRulers()   // ← add
  })
```

**Step 8: Commit**

```bash
git add apps/editor/src/lib/canvas-atom.ts
git commit -m "feat: add rulersLayer and ruler redraw integration to canvas-atom"
```

---

### Task 3: Add ruler cleanup to finalizer

**Files:**
- Modify: `apps/editor/src/lib/canvas-atom.ts`

The `rulersLayer` is destroyed when `stage.destroy()` is called in the finalizer, so no explicit cleanup is needed. However, verify the finalizer at ~line 602 doesn't need updating — it already calls `stage.destroy()` which destroys all layers.

No code change needed — just verify and commit a note if needed.

---

### Task 4: Visual verification

**Step 1: Start the dev server**

```bash
cd /home/hfahmi/work/freelance/nur
pnpm --filter editor dev
```

**Step 2: Open the editor and verify:**
- Rulers appear along the top and left edges of the frame image
- X ruler shows 0 → frameWidth labels (e.g. 0, 100, 200…)
- Y ruler shows 0 → frameHeight labels
- Tick density changes when zooming in/out
- Rulers stay flush with the frame edge when panning
- When masks exist, colored span bars appear on the ruler edges showing the layer bounding box

**Step 3: Commit if all looks good**

```bash
git add -p   # stage any minor tweaks made during verification
git commit -m "feat: canvas pixel rulers with mask projections"
```

---

### Notes on coordinate space

The rulers are drawn in **stage (Konva) coordinate space** — same space as the image and paths. Because `stage.scale({ x: zoom, y: zoom })` is applied, all shapes drawn at stage coords automatically transform with pan/zoom. We compensate sizes (stroke widths, font sizes, rect heights) by dividing by `zoom` (`inv = 1/zoom`) so they appear constant in screen pixels regardless of zoom level.

`frameOffsetX` / `frameOffsetY` are the stage-space coordinates of the frame image top-left corner — they come from `updateImageTransform` and represent where 0,0 in frame space maps to on the stage.
