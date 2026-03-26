import * as S from "effect/Schema"

export const ProjectMetaSchema = S.Struct({
  id: S.String,
  name: S.String,
  createdAt: S.Number,
  updatedAt: S.Number,
})

export type ProjectMeta = S.Schema.Type<typeof ProjectMetaSchema>
