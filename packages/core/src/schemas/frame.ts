import * as S from "effect/Schema"

export const FrameSchema = S.Struct({
  id: S.String,
  index: S.Number,
  contentHash: S.String,
  width: S.Number,
  height: S.Number,
})

export type Frame = S.Schema.Type<typeof FrameSchema>
