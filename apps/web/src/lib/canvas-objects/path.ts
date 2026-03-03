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
