import * as S from "effect/Schema"

export const ViewportSchema = S.Struct({
  x: S.Number,
  y: S.Number,
  zoom: S.Number,
})

export type Viewport = S.Schema.Type<typeof ViewportSchema>

export const AwarenessSchema = S.Struct({
  currentFrame: S.Number,
  activeTool: S.String,
  selection: S.Array(S.String),
  viewport: ViewportSchema,
})

export type AwarenessState = S.Schema.Type<typeof AwarenessSchema>
