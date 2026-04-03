import * as S from "effect/Schema"

export const ViewportSchema = S.Struct({
  x: S.Number,
  y: S.Number,
  zoom: S.Number.pipe(S.positive()),
})

export type Viewport = S.Schema.Type<typeof ViewportSchema>

export const DrawingState = S.Union(
  S.Literal("idle"),
  S.Literal("drawing"),
  S.Literal("closed"),
)
export type DrawingState = S.Schema.Type<typeof DrawingState>

export const AwarenessSchema = S.Struct({
  currentFrame: S.Number.pipe(S.int(), S.nonNegative()),
  activeTool: S.String.pipe(S.minLength(1)),
  activePathId: S.NullOr(S.String),
  activeLayerId: S.NullOr(S.String),
  drawingState: DrawingState,
  selection: S.Array(S.String),
  viewport: ViewportSchema,
})

export type AwarenessState = S.Schema.Type<typeof AwarenessSchema>
