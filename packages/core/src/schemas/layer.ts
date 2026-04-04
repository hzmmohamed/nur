import * as S from "effect/Schema"
import { YLinkedList } from "effect-yjs"
import { BezierPointSchema } from "./frame"

export const LayerSchema = S.Struct({
  name: S.String.pipe(S.minLength(1)),
  color: S.String.pipe(S.minLength(1)),
  index: S.Number.pipe(S.int(), S.nonNegative()),
  groupId: S.NullOr(S.String),
  masks: S.Record({ key: S.String, value: YLinkedList(BezierPointSchema) }),
})

export type Layer = S.Schema.Type<typeof LayerSchema>

export const LayerGroupSchema = S.Struct({
  name: S.String.pipe(S.minLength(1)),
  index: S.Number.pipe(S.int(), S.nonNegative()),
})

export type LayerGroup = S.Schema.Type<typeof LayerGroupSchema>

/** Flat representation of layer tree order. Array position = visual order, parentId = nesting. */
export const LayerOrderEntrySchema = S.Struct({
  id: S.String,
  type: S.Literal("layer", "group"),
  parentId: S.NullOr(S.String),
})

export type LayerOrderEntry = S.Schema.Type<typeof LayerOrderEntrySchema>
