import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { FrameSchema } from "./schemas/frame"
import { LayerSchema, LayerGroupSchema, LayerOrderEntrySchema } from "./schemas/layer"
import type { ProjectId } from "./schemas/ids"

export const ProjectDocSchema = S.Struct({
  name: S.Trimmed.pipe(S.minLength(1), S.maxLength(200)),
  frames: S.Record({ key: S.String, value: FrameSchema }),
  layers: S.Record({ key: S.String, value: LayerSchema }),
  layerGroups: S.Record({ key: S.String, value: LayerGroupSchema }),
  layerOrder: S.Array(LayerOrderEntrySchema),
})

export type ProjectDoc = S.Schema.Type<typeof ProjectDocSchema>

/** Create a fresh Y.Doc with the ProjectDoc schema. No persistence — caller manages that. */
export function createProjectDoc(_projectId: ProjectId) {
  const { doc, root } = YDocument.make(ProjectDocSchema)
  return { doc, root }
}
