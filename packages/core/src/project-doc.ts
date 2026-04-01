import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { createYDocPersistence } from "./ydoc-persistence"
import { FrameSchema } from "./schemas/frame"
import type { ProjectId } from "./schemas/ids"

export const ProjectDocSchema = S.Struct({
  name: S.Trimmed.pipe(S.minLength(1), S.maxLength(200)),
  frames: S.Record({ key: S.String, value: FrameSchema }),
})

export type ProjectDoc = S.Schema.Type<typeof ProjectDocSchema>

export function createProjectDoc(projectId: ProjectId) {
  const { doc, root } = YDocument.make(ProjectDocSchema)
  const persistence = createYDocPersistence(`nur-project-${projectId}`, doc)
  return { doc, root, persistence }
}
