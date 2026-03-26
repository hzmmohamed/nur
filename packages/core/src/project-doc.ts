import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { IndexeddbPersistence } from "y-indexeddb"
import { FrameSchema } from "./schemas/frame"

export const ProjectDocSchema = S.Struct({
  name: S.String,
  frames: S.Record({ key: S.String, value: FrameSchema }),
})

export type ProjectDoc = S.Schema.Type<typeof ProjectDocSchema>

export function createProjectDoc(projectId: string) {
  const { doc, root } = YDocument.make(ProjectDocSchema)
  const persistence = new IndexeddbPersistence(`nur-project-${projectId}`, doc)
  return { doc, root, persistence }
}
