# Bezier Path Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `BezierPath` class that bridges effect-yjs YLinkedList with Konva canvas rendering, enabling reactive collaborative bezier curve editing.

**Architecture:** A single class receives a `YLinkedListLens` and a `Konva.Layer`. It subscribes to the `ids()` atom for structural changes (add/remove points) and per-node atoms for field changes (position/handle updates). Konva objects are stored in a HashMap keyed by stable node IDs. A test page with two synced Y.Docs demonstrates bidirectional CRDT sync.

**Tech Stack:** effect-yjs (YLinkedList, YLens, YDocument), @effect-atom/atom (Registry, Atom), effect (Schema, HashSet, HashMap), Konva, Yjs, TanStack Router, Vitest

---

### Task 1: Schema & Types

**Files:**
- Modify: `src/lib/canvas-objects/path.ts`

**Step 1: Add BezierPointSchema and PathDocumentSchema**

Replace the contents of `src/lib/canvas-objects/path.ts` with the schemas and type exports:

```ts
import { Schema as S } from "effect"
import { YLinkedList } from "effect-yjs"

// Coordinate types
export const PointSchema = S.Struct({
  x: S.Number,
  y: S.Number,
})

export const BoundsSchema = S.Struct({
  minX: S.Number,
  minY: S.Number,
  maxX: S.Number,
  maxY: S.Number,
})

// Bezier point with polar handle representation
// Sentinel: distance = 0 means "no handle"
export const BezierPointSchema = S.Struct({
  x: S.Number,
  y: S.Number,
  handleInAngle: S.Number,
  handleInDistance: S.Number,
  handleOutAngle: S.Number,
  handleOutDistance: S.Number,
})

export type BezierPointData = typeof BezierPointSchema.Type

export const PathDocumentSchema = S.Struct({
  points: YLinkedList(BezierPointSchema),
})

export type PathDocumentData = typeof PathDocumentSchema.Type

/** Create a BezierPointData with no handles */
export function makePoint(x: number, y: number): BezierPointData {
  return {
    x, y,
    handleInAngle: 0, handleInDistance: 0,
    handleOutAngle: 0, handleOutDistance: 0,
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `path.ts`

**Step 3: Commit**

```bash
git add src/lib/canvas-objects/path.ts
git commit -m "feat(bezier): add BezierPointSchema and PathDocumentSchema"
```

---

### Task 2: Bezier math utilities

**Files:**
- Create: `src/lib/canvas-objects/bezier-math.ts`
- Create: `src/lib/canvas-objects/bezier-math.test.ts`

These are pure functions with no dependencies on Konva or Yjs. They handle SVG path generation and de Casteljau splitting.

**Step 1: Write the failing tests**

Create `src/lib/canvas-objects/bezier-math.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  buildSvgPathData,
  sampleCubicBezier,
  findNearestPointOnPath,
  splitCubicBezierAt,
} from "./bezier-math"
import type { BezierPointData } from "./path"

const pt = (x: number, y: number): BezierPointData => ({
  x, y,
  handleInAngle: 0, handleInDistance: 0,
  handleOutAngle: 0, handleOutDistance: 0,
})

describe("buildSvgPathData", () => {
  it("returns empty string for no points", () => {
    expect(buildSvgPathData([])).toBe("")
  })

  it("returns M command for single point", () => {
    expect(buildSvgPathData([pt(10, 20)])).toBe("M 10 20")
  })

  it("returns L commands for points with no handles", () => {
    const result = buildSvgPathData([pt(0, 0), pt(100, 100)])
    expect(result).toBe("M 0 0 L 100 100")
  })

  it("returns C commands when handles are present", () => {
    const p1: BezierPointData = {
      x: 0, y: 0,
      handleInAngle: 0, handleInDistance: 0,
      handleOutAngle: 0, handleOutDistance: 50, // handle pointing right
    }
    const p2: BezierPointData = {
      x: 100, y: 0,
      handleInAngle: Math.PI, handleInDistance: 50, // handle pointing left
      handleOutAngle: 0, handleOutDistance: 0,
    }
    const result = buildSvgPathData([p1, p2])
    // C cp1x cp1y cp2x cp2y x y
    // cp1 = (0 + cos(0)*50, 0 + sin(0)*50) = (50, 0)
    // cp2 = (100 + cos(PI)*50, 0 + sin(PI)*50) = (50, ~0)
    expect(result).toMatch(/^M 0 0 C /)
  })
})

describe("sampleCubicBezier", () => {
  it("returns start point at t=0", () => {
    const p = sampleCubicBezier(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 90, y: 0 }, { x: 100, y: 0 },
      0
    )
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(0)
  })

  it("returns end point at t=1", () => {
    const p = sampleCubicBezier(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 90, y: 0 }, { x: 100, y: 0 },
      1
    )
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(0)
  })

  it("returns midpoint at t=0.5 for symmetric curve", () => {
    const p = sampleCubicBezier(
      { x: 0, y: 0 }, { x: 0, y: 100 },
      { x: 100, y: 100 }, { x: 100, y: 0 },
      0.5
    )
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeCloseTo(75)
  })
})

describe("splitCubicBezierAt", () => {
  it("split at t=0.5 produces two sub-curves that meet at midpoint", () => {
    const p0 = { x: 0, y: 0 }
    const cp1 = { x: 0, y: 100 }
    const cp2 = { x: 100, y: 100 }
    const p1 = { x: 100, y: 0 }

    const { left, right } = splitCubicBezierAt(p0, cp1, cp2, p1, 0.5)

    // left curve ends at the split point
    expect(left.p1.x).toBeCloseTo(right.p0.x)
    expect(left.p1.y).toBeCloseTo(right.p0.y)

    // left starts at original start
    expect(left.p0.x).toBeCloseTo(0)
    expect(left.p0.y).toBeCloseTo(0)

    // right ends at original end
    expect(right.p1.x).toBeCloseTo(100)
    expect(right.p1.y).toBeCloseTo(0)
  })
})

describe("findNearestPointOnPath", () => {
  it("returns null for fewer than 2 points", () => {
    expect(findNearestPointOnPath([], 50, 50, 10)).toBeNull()
    expect(findNearestPointOnPath([pt(0, 0)], 50, 50, 10)).toBeNull()
  })

  it("finds a point on a straight line segment", () => {
    const points = [pt(0, 0), pt(100, 0)]
    const ids = ["a", "b"]
    const result = findNearestPointOnPath(points, 50, 0, 10, ids)
    expect(result).not.toBeNull()
    expect(result!.afterId).toBe("a")
    expect(result!.point.x).toBeCloseTo(50, 0)
    expect(result!.point.y).toBeCloseTo(0, 0)
  })

  it("returns null when click is too far from path", () => {
    const points = [pt(0, 0), pt(100, 0)]
    const ids = ["a", "b"]
    const result = findNearestPointOnPath(points, 50, 50, 10, ids)
    expect(result).toBeNull()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/canvas-objects/bezier-math.test.ts`
Expected: FAIL — module not found

**Step 3: Implement bezier-math.ts**

Create `src/lib/canvas-objects/bezier-math.ts`:

```ts
import { polarToCartesian } from "@/lib/domain/coordinate-utils"
import type { BezierPointData } from "./path"

interface Point2D {
  x: number
  y: number
}

/**
 * Build SVG path data string from an ordered array of BezierPointData.
 * Uses L (line-to) when both adjacent handles have distance=0,
 * otherwise uses C (cubic bezier).
 */
export function buildSvgPathData(points: ReadonlyArray<BezierPointData>): string {
  if (points.length === 0) return ""
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`]

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]

    const hasHandleOut = prev.handleOutDistance > 0
    const hasHandleIn = curr.handleInDistance > 0

    if (!hasHandleOut && !hasHandleIn) {
      parts.push(`L ${curr.x} ${curr.y}`)
    } else {
      const cp1 = hasHandleOut
        ? polarToCartesian(prev.x, prev.y, prev.handleOutAngle, prev.handleOutDistance)
        : { x: prev.x, y: prev.y }
      const cp2 = hasHandleIn
        ? polarToCartesian(curr.x, curr.y, curr.handleInAngle, curr.handleInDistance)
        : { x: curr.x, y: curr.y }
      parts.push(`C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${curr.x} ${curr.y}`)
    }
  }

  return parts.join(" ")
}

/**
 * Evaluate a cubic bezier curve at parameter t using de Casteljau's algorithm.
 */
export function sampleCubicBezier(
  p0: Point2D, cp1: Point2D, cp2: Point2D, p1: Point2D, t: number
): Point2D {
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t2 * t * p1.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t2 * t * p1.y,
  }
}

/**
 * Split a cubic bezier at parameter t using de Casteljau subdivision.
 * Returns left and right sub-curves, each defined by 4 control points.
 */
export function splitCubicBezierAt(
  p0: Point2D, cp1: Point2D, cp2: Point2D, p1: Point2D, t: number
): {
  left: { p0: Point2D; cp1: Point2D; cp2: Point2D; p1: Point2D }
  right: { p0: Point2D; cp1: Point2D; cp2: Point2D; p1: Point2D }
} {
  const lerp = (a: Point2D, b: Point2D, t: number): Point2D => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  })

  const a = lerp(p0, cp1, t)
  const b = lerp(cp1, cp2, t)
  const c = lerp(cp2, p1, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  const mid = lerp(d, e, t)

  return {
    left: { p0, cp1: a, cp2: d, p1: mid },
    right: { p0: mid, cp1: e, cp2: c, p1 },
  }
}

/**
 * Get the 4 control points for the cubic bezier segment between two adjacent BezierPointData.
 */
export function getSegmentControlPoints(
  prev: BezierPointData, curr: BezierPointData
): { p0: Point2D; cp1: Point2D; cp2: Point2D; p1: Point2D } {
  const p0 = { x: prev.x, y: prev.y }
  const p1 = { x: curr.x, y: curr.y }
  const cp1 = prev.handleOutDistance > 0
    ? polarToCartesian(prev.x, prev.y, prev.handleOutAngle, prev.handleOutDistance)
    : p0
  const cp2 = curr.handleInDistance > 0
    ? polarToCartesian(curr.x, curr.y, curr.handleInAngle, curr.handleInDistance)
    : p1
  return { p0, cp1, cp2, p1 }
}

/**
 * Find the nearest point on a path to a given click position.
 * Returns the node ID after which to insert, the new point data, and
 * the updated handles for the neighboring points.
 *
 * Returns null if click is farther than `tolerance` from any segment.
 */
export function findNearestPointOnPath(
  points: ReadonlyArray<BezierPointData>,
  clickX: number,
  clickY: number,
  tolerance: number,
  ids?: ReadonlyArray<string>,
): {
  afterId: string
  point: BezierPointData
  updatedPrevHandleOut: { angle: number; distance: number }
  updatedNextHandleIn: { angle: number; distance: number }
} | null {
  if (points.length < 2) return null

  const SAMPLES = 20
  let bestDist = Infinity
  let bestSegIdx = -1
  let bestT = 0
  let bestPt: Point2D = { x: 0, y: 0 }

  for (let i = 0; i < points.length - 1; i++) {
    const seg = getSegmentControlPoints(points[i], points[i + 1])

    for (let s = 0; s <= SAMPLES; s++) {
      const t = s / SAMPLES
      const pt = sampleCubicBezier(seg.p0, seg.cp1, seg.cp2, seg.p1, t)
      const dx = pt.x - clickX
      const dy = pt.y - clickY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < bestDist) {
        bestDist = dist
        bestSegIdx = i
        bestT = t
        bestPt = pt
      }
    }
  }

  if (bestDist > tolerance) return null

  const seg = getSegmentControlPoints(points[bestSegIdx], points[bestSegIdx + 1])
  const { left, right } = splitCubicBezierAt(seg.p0, seg.cp1, seg.cp2, seg.p1, bestT)

  const { cartesianToPolar } = await import("@/lib/domain/coordinate-utils")

  const handleIn = cartesianToPolar(bestPt.x, bestPt.y, left.cp2.x, left.cp2.y)
  const handleOut = cartesianToPolar(bestPt.x, bestPt.y, right.cp1.x, right.cp1.y)
  const updatedPrevHandleOut = cartesianToPolar(seg.p0.x, seg.p0.y, left.cp1.x, left.cp1.y)
  const updatedNextHandleIn = cartesianToPolar(seg.p1.x, seg.p1.y, right.cp2.x, right.cp2.y)

  const nodeIds = ids ?? points.map((_, i) => String(i))

  return {
    afterId: nodeIds[bestSegIdx],
    point: {
      x: bestPt.x,
      y: bestPt.y,
      handleInAngle: handleIn.angle,
      handleInDistance: handleIn.distance,
      handleOutAngle: handleOut.angle,
      handleOutDistance: handleOut.distance,
    },
    updatedPrevHandleOut,
    updatedNextHandleIn,
  }
}
```

**Important note:** The `findNearestPointOnPath` uses a dynamic import for `cartesianToPolar`. Change this to a static import at the top of the file instead:

```ts
import { polarToCartesian, cartesianToPolar } from "@/lib/domain/coordinate-utils"
```

And remove the `await import(...)` line, making the function synchronous. The code above with the dynamic import is a mistake — the function should be synchronous and use the static import.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/canvas-objects/bezier-math.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/canvas-objects/bezier-math.ts src/lib/canvas-objects/bezier-math.test.ts
git commit -m "feat(bezier): add bezier math utilities with tests"
```

---

### Task 3: BezierPath class — structural loop (ids tracking)

**Files:**
- Create: `src/lib/canvas-objects/bezier-curve.ts`

This task builds the class skeleton with the structural reactive loop — subscribing to `ids()` and managing the HashMap of Konva groups.

**Step 1: Implement the BezierPath class skeleton**

Create `src/lib/canvas-objects/bezier-curve.ts`:

```ts
import Konva from "konva"
import * as HashMap from "effect/HashMap"
import * as HashSet from "effect/HashSet"
import { Registry } from "@effect-atom/atom"
import type { YLinkedListLens } from "effect-yjs"
import { cartesianToPolar, polarToCartesian } from "@/lib/domain/coordinate-utils"
import { buildSvgPathData, findNearestPointOnPath, getSegmentControlPoints } from "./bezier-math"
import type { BezierPointData } from "./path"

const POINT_RADIUS = 6
const HANDLE_RADIUS = 4
const POINT_COLOR = "#4A90D9"
const HANDLE_COLOR = "#E87D3E"
const LINE_COLOR = "#888888"
const PATH_COLOR = "#FFFFFF"
const PATH_WIDTH = 2
const HANDLE_LINE_COLOR = "#666666"
const HIT_TOLERANCE = 10

interface PointObjects {
  group: Konva.Group
  pointCircle: Konva.Circle
  handleInLine: Konva.Line
  handleInCircle: Konva.Circle
  handleOutLine: Konva.Line
  handleOutCircle: Konva.Circle
  unsubscribe: () => void
}

export class BezierPath {
  private readonly registry: Registry
  private pointObjects: HashMap.HashMap<string, PointObjects> = HashMap.empty()
  private readonly pathLine: Konva.Path
  private readonly layer: Konva.Layer
  private readonly lens: YLinkedListLens<BezierPointData>
  private unsubscribeIds: (() => void) | null = null
  private unsubscribeList: (() => void) | null = null
  private currentIds: HashSet.HashSet<string> = HashSet.empty()

  constructor(lens: YLinkedListLens<BezierPointData>, layer: Konva.Layer) {
    this.lens = lens
    this.layer = layer
    this.registry = Registry.make()

    // Create the path line (behind everything)
    this.pathLine = new Konva.Path({
      data: "",
      stroke: PATH_COLOR,
      strokeWidth: PATH_WIDTH,
      listening: true,
      hitStrokeWidth: HIT_TOLERANCE * 2,
    })
    this.layer.add(this.pathLine)

    // Click on path line -> insert point
    this.pathLine.on("click", (e) => {
      e.cancelBubble = true
      this.handlePathClick(e)
    })

    this.startStructuralLoop()
    this.startPathRenderLoop()
  }

  /** Subscribe to ids() atom — diff to create/destroy Konva objects */
  private startStructuralLoop(): void {
    const idsAtom = this.lens.ids()
    // Read initial value and subscribe
    this.currentIds = this.registry.get(idsAtom)
    this.syncPointObjects(HashSet.empty(), this.currentIds)

    this.unsubscribeIds = this.registry.subscribe(idsAtom, (newIds) => {
      const oldIds = this.currentIds
      this.currentIds = newIds
      this.syncPointObjects(oldIds, newIds)
    })
  }

  /** Subscribe to the whole list atom to rebuild SVG path on any change */
  private startPathRenderLoop(): void {
    const listAtom = this.lens.atom()
    this.updatePathLine()

    this.unsubscribeList = this.registry.subscribe(listAtom, () => {
      this.updatePathLine()
    })
  }

  /** Diff old vs new IDs, create/destroy point Konva objects */
  private syncPointObjects(
    oldIds: HashSet.HashSet<string>,
    newIds: HashSet.HashSet<string>
  ): void {
    // Removed IDs
    const removed = HashSet.difference(oldIds, newIds)
    for (const id of removed) {
      const entry = HashMap.get(this.pointObjects, id)
      if (entry._tag === "Some") {
        entry.value.unsubscribe()
        entry.value.group.destroy()
        this.pointObjects = HashMap.remove(this.pointObjects, id)
      }
    }

    // Added IDs
    const added = HashSet.difference(newIds, oldIds)
    for (const id of added) {
      const objects = this.createPointObjects(id)
      this.pointObjects = HashMap.set(this.pointObjects, id, objects)
    }

    this.layer.batchDraw()
  }

  /** Create Konva objects for a single point and subscribe to its atom */
  private createPointObjects(id: string): PointObjects {
    const nodeLens = this.lens.find(id)
    const group = new Konva.Group()

    // Handle-in line
    const handleInLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: HANDLE_LINE_COLOR,
      strokeWidth: 1,
      visible: false,
    })

    // Handle-in circle
    const handleInCircle = new Konva.Circle({
      radius: HANDLE_RADIUS,
      fill: HANDLE_COLOR,
      draggable: true,
      visible: false,
    })

    // Handle-out line
    const handleOutLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: HANDLE_LINE_COLOR,
      strokeWidth: 1,
      visible: false,
    })

    // Handle-out circle
    const handleOutCircle = new Konva.Circle({
      radius: HANDLE_RADIUS,
      fill: HANDLE_COLOR,
      draggable: true,
      visible: false,
    })

    // Point circle (on top)
    const pointCircle = new Konva.Circle({
      radius: POINT_RADIUS,
      fill: POINT_COLOR,
      stroke: "#FFFFFF",
      strokeWidth: 1,
      draggable: true,
    })

    group.add(handleInLine, handleInCircle, handleOutLine, handleOutCircle, pointCircle)
    this.layer.add(group)

    // --- Drag handlers (user -> Yjs) ---

    pointCircle.on("dragmove", () => {
      const x = pointCircle.x()
      const y = pointCircle.y()
      nodeLens.focus("x").syncSet(x)
      nodeLens.focus("y").syncSet(y)
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

    // Prevent click from bubbling to stage
    pointCircle.on("click", (e) => { e.cancelBubble = true })
    handleInCircle.on("click", (e) => { e.cancelBubble = true })
    handleOutCircle.on("click", (e) => { e.cancelBubble = true })

    // --- Reactive update (Yjs -> Konva) ---

    const nodeAtom = nodeLens.atom()
    const initialData = this.registry.get(nodeAtom)
    if (initialData) {
      this.updatePointKonva(initialData, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
    }

    const unsubscribe = this.registry.subscribe(nodeAtom, (data) => {
      if (!data) return
      this.updatePointKonva(data, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
      this.layer.batchDraw()
    })

    return {
      group, pointCircle,
      handleInLine, handleInCircle,
      handleOutLine, handleOutCircle,
      unsubscribe,
    }
  }

  /** Update Konva objects from point data */
  private updatePointKonva(
    data: BezierPointData,
    pointCircle: Konva.Circle,
    handleInLine: Konva.Line,
    handleInCircle: Konva.Circle,
    handleOutLine: Konva.Line,
    handleOutCircle: Konva.Circle,
  ): void {
    pointCircle.position({ x: data.x, y: data.y })

    // Handle-in
    if (data.handleInDistance > 0) {
      const hIn = polarToCartesian(data.x, data.y, data.handleInAngle, data.handleInDistance)
      handleInCircle.position(hIn)
      handleInLine.points([data.x, data.y, hIn.x, hIn.y])
      handleInCircle.visible(true)
      handleInLine.visible(true)
    } else {
      handleInCircle.visible(false)
      handleInLine.visible(false)
    }

    // Handle-out
    if (data.handleOutDistance > 0) {
      const hOut = polarToCartesian(data.x, data.y, data.handleOutAngle, data.handleOutDistance)
      handleOutCircle.position(hOut)
      handleOutLine.points([data.x, data.y, hOut.x, hOut.y])
      handleOutCircle.visible(true)
      handleOutLine.visible(true)
    } else {
      handleOutCircle.visible(false)
      handleOutLine.visible(false)
    }
  }

  /** Rebuild SVG path data from all points */
  private updatePathLine(): void {
    const points = this.lens.get()
    const svgData = buildSvgPathData(points)
    this.pathLine.data(svgData)
    this.layer.batchDraw()
  }

  /** Handle click on the path line — insert a new point via de Casteljau */
  private handlePathClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    const stage = this.layer.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    const points = this.lens.get()
    const nodesMap = this.lens.nodes()
    const ids = Array.from(nodesMap.keys())

    const result = findNearestPointOnPath(points, pos.x, pos.y, HIT_TOLERANCE, ids)
    if (!result) return

    // Update the neighbor handles and insert the new point
    const prevLens = this.lens.find(result.afterId)
    prevLens.focus("handleOutAngle").syncSet(result.updatedPrevHandleOut.angle)
    prevLens.focus("handleOutDistance").syncSet(result.updatedPrevHandleOut.distance)

    // Find the next node ID (the one after afterId in the list)
    const afterIdx = ids.indexOf(result.afterId)
    if (afterIdx >= 0 && afterIdx < ids.length - 1) {
      const nextId = ids[afterIdx + 1]
      const nextLens = this.lens.find(nextId)
      nextLens.focus("handleInAngle").syncSet(result.updatedNextHandleIn.angle)
      nextLens.focus("handleInDistance").syncSet(result.updatedNextHandleIn.distance)
    }

    this.lens.insertAfter(result.afterId, result.point)
  }

  /** Append a new point at the end of the path */
  appendPoint(x: number, y: number): string {
    return this.lens.append({
      x, y,
      handleInAngle: 0, handleInDistance: 0,
      handleOutAngle: 0, handleOutDistance: 0,
    })
  }

  /** Clean up all subscriptions and Konva objects */
  dispose(): void {
    this.unsubscribeIds?.()
    this.unsubscribeList?.()

    for (const [, objects] of this.pointObjects) {
      objects.unsubscribe()
      objects.group.destroy()
    }
    this.pointObjects = HashMap.empty()

    this.pathLine.destroy()
    this.registry.dispose()
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `bezier-curve.ts`

**Step 3: Commit**

```bash
git add src/lib/canvas-objects/bezier-curve.ts
git commit -m "feat(bezier): add BezierPath class with reactive Konva rendering"
```

---

### Task 4: Test page route

**Files:**
- Create: `src/routes/bezier-test.tsx`

**Step 1: Implement the test page**

Create `src/routes/bezier-test.tsx`:

```tsx
import { useEffect, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import Konva from "konva"
import * as Y from "yjs"
import { YDocument } from "effect-yjs"
import { PathDocumentSchema } from "@/lib/canvas-objects/path"
import { BezierPath } from "@/lib/canvas-objects/bezier-curve"

function BezierTestPage() {
  const container1Ref = useRef<HTMLDivElement>(null)
  const container2Ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const c1 = container1Ref.current
    const c2 = container2Ref.current
    if (!c1 || !c2) return

    // --- Create two Y.Docs ---
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    // --- Bidirectional sync ---
    doc1.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "remote") {
        Y.applyUpdate(doc2, update, "remote")
      }
    })
    doc2.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "remote") {
        Y.applyUpdate(doc1, update, "remote")
      }
    })

    // --- Bind schemas ---
    const root1 = YDocument.bind(PathDocumentSchema, doc1)
    const root2 = YDocument.bind(PathDocumentSchema, doc2)

    const lens1 = root1.focus("points")
    const lens2 = root2.focus("points")

    // --- Create Konva stages ---
    const width = Math.floor(c1.clientWidth)
    const height = Math.floor(c1.clientHeight)

    const stage1 = new Konva.Stage({
      container: c1,
      width,
      height,
    })
    const layer1 = new Konva.Layer()
    stage1.add(layer1)

    const stage2 = new Konva.Stage({
      container: c2,
      width,
      height,
    })
    const layer2 = new Konva.Layer()
    stage2.add(layer2)

    // --- Create BezierPath instances ---
    const path1 = new BezierPath(lens1, layer1)
    const path2 = new BezierPath(lens2, layer2)

    // --- Stage click handlers (click on empty area -> append point) ---
    stage1.on("click", (e) => {
      // Only handle clicks on the stage background
      if (e.target !== stage1) return
      const pos = stage1.getPointerPosition()
      if (!pos) return
      path1.appendPoint(pos.x, pos.y)
    })

    stage2.on("click", (e) => {
      if (e.target !== stage2) return
      const pos = stage2.getPointerPosition()
      if (!pos) return
      path2.appendPoint(pos.x, pos.y)
    })

    // --- Resize handler ---
    const handleResize = () => {
      if (!c1 || !c2) return
      const w = Math.floor(c1.clientWidth)
      const h = Math.floor(c1.clientHeight)
      stage1.width(w)
      stage1.height(h)
      stage2.width(w)
      stage2.height(h)
    }
    window.addEventListener("resize", handleResize)

    // --- Cleanup ---
    return () => {
      window.removeEventListener("resize", handleResize)
      path1.dispose()
      path2.dispose()
      stage1.destroy()
      stage2.destroy()
      doc1.destroy()
      doc2.destroy()
    }
  }, [])

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 border-r border-border">
        <div className="p-2 text-xs text-muted-foreground text-center">
          Doc 1 — Click to add points, drag to move
        </div>
        <div ref={container1Ref} className="w-full" style={{ height: "calc(100% - 28px)" }} />
      </div>
      <div className="flex-1">
        <div className="p-2 text-xs text-muted-foreground text-center">
          Doc 2 — Synced via direct Y.Doc update exchange
        </div>
        <div ref={container2Ref} className="w-full" style={{ height: "calc(100% - 28px)" }} />
      </div>
    </div>
  )
}

export const Route = createFileRoute("/bezier-test")({
  component: BezierTestPage,
})
```

**Step 2: Start dev server and verify the page loads**

Run: `npx vite dev`
Navigate to: `http://localhost:5173/bezier-test`
Expected: Two side-by-side panels with labels. Clicking in one panel should add points that appear in both panels.

**Step 3: Commit**

```bash
git add src/routes/bezier-test.tsx
git commit -m "feat(bezier): add test page with dual synced Konva stages"
```

---

### Task 5: Integration testing & iteration fixes

**Files:**
- Modify: `src/lib/canvas-objects/bezier-curve.ts` (as needed)
- Modify: `src/lib/canvas-objects/bezier-math.ts` (as needed)
- Modify: `src/routes/bezier-test.tsx` (as needed)

**Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Manual testing in browser**

Open `http://localhost:5173/bezier-test` and verify:

1. Click in left panel -> point appears in both panels
2. Click in right panel -> point appears in both panels
3. Drag a point in left panel -> position updates in both panels
4. Multiple points -> SVG path renders between them
5. Click on the rendered path line -> new point inserted at click position

**Step 3: Fix any issues found during testing**

Common issues to watch for:
- HashMap iteration: `for (const [key, value] of hashmap)` — verify this works with Effect HashMap or switch to native Map if needed
- Atom subscription timing: ensure initial read happens before subscribe
- Konva event bubbling: verify `cancelBubble` prevents stage click on point/path click
- Path data formatting: SVG path `C` command needs exact spacing

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix(bezier): integration fixes from manual testing"
```

---

### Key Reference Files

| Purpose | Path |
|---------|------|
| Coordinate utils | `src/lib/domain/coordinate-utils.ts` |
| effect-yjs YLinkedList | `.agents/effect-yjs/src/YLinkedList.ts` |
| effect-yjs YDocument | `.agents/effect-yjs/src/YDocument.ts` |
| effect-yjs YLens | `.agents/effect-yjs/src/YLens.ts` |
| effect-yjs atoms | `.agents/effect-yjs/src/atoms.ts` |
| effect-atom Atom | `.agents/effect-atom/packages/atom/src/Atom.ts` |
| effect-atom Registry | `.agents/effect-atom/packages/atom/src/Registry.ts` |
| Existing path schema | `src/lib/canvas-objects/path.ts` |
| Existing domain types | `src/lib/domain/coordinate-utils.ts` |

### Key API Patterns

**YLinkedList lens access:**
```ts
const lens = root.focus("points")          // YLinkedListLens<BezierPointData>
lens.append(data)                          // returns string ID
lens.find(id)                              // returns YLens<BezierPointData>
lens.find(id).focus("x").syncSet(100)      // write single field
lens.ids()                                 // Atom<HashSet<string>> — structural changes only
lens.atom()                                // Atom<BezierPointData[]> — all changes
lens.nodes()                               // Map<string, YLens<BezierPointData>> — snapshot
```

**Registry usage:**
```ts
const registry = Registry.make()
const value = registry.get(atom)           // read current value
const unsub = registry.subscribe(atom, (v) => { ... })  // subscribe
registry.dispose()                         // cleanup
```
