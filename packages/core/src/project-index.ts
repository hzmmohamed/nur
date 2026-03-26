import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { IndexeddbPersistence } from "y-indexeddb"
import { ProjectMetaSchema } from "./schemas/project-meta"

export const ProjectIndexSchema = S.Struct({
  projects: S.Record({ key: S.String, value: ProjectMetaSchema }),
})

export type ProjectIndex = S.Schema.Type<typeof ProjectIndexSchema>

const PROJECT_INDEX_DB = "nur-project-index"

export function createProjectIndex() {
  const { doc, root } = YDocument.make(ProjectIndexSchema)
  const persistence = new IndexeddbPersistence(PROJECT_INDEX_DB, doc)
  return { doc, root, persistence }
}
