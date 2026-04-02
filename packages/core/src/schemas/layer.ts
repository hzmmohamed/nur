import * as S from "effect/Schema"

export const LayerSchema = S.Struct({
  name: S.String.pipe(S.minLength(1)),
  color: S.String.pipe(S.minLength(1)),
  index: S.Number.pipe(S.int(), S.nonNegative()),
})

export type Layer = S.Schema.Type<typeof LayerSchema>
