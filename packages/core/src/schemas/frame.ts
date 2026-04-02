import * as S from "effect/Schema"
import { FrameId } from "./ids"

export const ContentHash = S.Trimmed.pipe(S.minLength(1), S.brand("ContentHash"))
export type ContentHash = S.Schema.Type<typeof ContentHash>

export const BezierPointSchema = S.Struct({
  x: S.Number,
  y: S.Number,
  handleInAngle: S.Number,
  handleInDistance: S.Number,
  handleOutAngle: S.Number,
  handleOutDistance: S.Number,
})

export type BezierPointData = S.Schema.Type<typeof BezierPointSchema>

export const FrameSchema = S.Struct({
  id: FrameId,
  index: S.Number.pipe(S.int(), S.nonNegative()),
  contentHash: ContentHash,
  width: S.Number.pipe(S.int(), S.positive()),
  height: S.Number.pipe(S.int(), S.positive()),
})

export type Frame = S.Schema.Type<typeof FrameSchema>

/** Create a BezierPointData with no handles */
export function makePoint(x: number, y: number): BezierPointData {
  return {
    x, y,
    handleInAngle: 0, handleInDistance: 0,
    handleOutAngle: 0, handleOutDistance: 0,
  }
}
