import * as S from "effect/Schema"
import { ProjectId } from "./ids"

export const ProjectMetaSchema = S.Struct({
  id: ProjectId,
  name: S.Trimmed.pipe(S.minLength(1), S.maxLength(200)),
  createdAt: S.Number.pipe(S.positive()),
  updatedAt: S.Number.pipe(S.positive()),
})

export type ProjectMeta = S.Schema.Type<typeof ProjectMetaSchema>
