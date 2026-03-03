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
