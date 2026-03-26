import { useEffect, useState } from "react"
import { createProjectDoc, ProjectId } from "@nur/core"
import type { YDocumentRoot } from "effect-yjs"
import type { ProjectDoc } from "@nur/core"
import type * as Y from "yjs"
import * as S from "effect/Schema"

const parseProjectId = S.decodeSync(ProjectId)

const cache = new Map<string, ReturnType<typeof createProjectDoc>>()

function getProjectDoc(projectId: string) {
  let instance = cache.get(projectId)
  if (!instance) {
    const id = parseProjectId(projectId)
    instance = createProjectDoc(id)
    cache.set(projectId, instance)
  }
  return instance
}

export function useProjectDoc(projectId: string): {
  root: YDocumentRoot<ProjectDoc>
  doc: Y.Doc
  ready: boolean
} {
  const { root, doc, persistence } = getProjectDoc(projectId)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    persistence.once("synced", () => {
      setReady(true)
    })
    if (persistence.synced) {
      setReady(true)
    }
  }, [projectId])

  return { root, doc, ready }
}
