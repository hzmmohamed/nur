import * as S from "effect/Schema"
import { FrameId } from "./ids"

export const ContentHash = S.Trimmed.pipe(S.minLength(1), S.brand("ContentHash"))
export type ContentHash = S.Schema.Type<typeof ContentHash>

export const FrameSchema = S.Struct({
  id: FrameId,
  index: S.Number.pipe(S.int(), S.nonNegative()),
  contentHash: ContentHash,
  width: S.Number.pipe(S.int(), S.positive()),
  height: S.Number.pipe(S.int(), S.positive()),
})

export type Frame = S.Schema.Type<typeof FrameSchema>
