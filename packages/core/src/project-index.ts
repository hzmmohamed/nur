import * as S from "effect/Schema"
import { ProjectMetaSchema } from "./schemas/project-meta"

export const ProjectIndexSchema = S.Record({ key: S.String, value: ProjectMetaSchema })

export type ProjectIndex = S.Schema.Type<typeof ProjectIndexSchema>
