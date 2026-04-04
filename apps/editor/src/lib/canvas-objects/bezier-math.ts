import { polarToCartesian, cartesianToPolar } from "@/lib/domain/coordinate-utils"
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

  // Close path if first and last points share coordinates
  if (points.length >= 3) {
    const first = points[0]
    const last = points[points.length - 1]
    if (first.x === last.x && first.y === last.y) {
      parts.push("Z")
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

/**
 * Compute the outward normal direction at a path vertex.
 * Uses the average of the incoming and outgoing edge directions,
 * rotated 90° (left normal for clockwise winding = outward).
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
    nx += -dy / len
    ny += dx / len
  }

  if (next) {
    const dx = next.x - curr.x
    const dy = next.y - curr.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
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
 * (1 + bufferDistance / avgEdgeLength) to approximate the offset curve.
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
