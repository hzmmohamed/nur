import { useMemo } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { createProjectDoc, ProjectId } from "@nur/core"
import type { YDocumentRoot } from "effect-yjs"
import type { ProjectDoc } from "@nur/core"
import type * as Y from "yjs"
import * as S from "effect/Schema"

const parseProjectId = S.decodeSync(ProjectId)

const cache = new Map<string, ReturnType<typeof createProjectDoc> & { readyAtom: Atom.Atom<boolean> }>()

function getProjectDoc(projectId: string) {
  let entry = cache.get(projectId)
  if (!entry) {
    const id = parseProjectId(projectId)
    const doc = createProjectDoc(id)
    const readyAtom = Atom.make((get) => {
      if (doc.persistence.synced) return true
      const handler = () => get.setSelf(true)
      doc.persistence.once("synced", handler)
      get.addFinalizer(() => doc.persistence.off("synced", handler))
      return false
    })
    entry = { ...doc, readyAtom }
    cache.set(projectId, entry)
  }
  return entry
}

export function useProjectDoc(projectId: string): {
  root: YDocumentRoot<ProjectDoc>
  doc: Y.Doc
  ready: boolean
} {
  const entry = useMemo(() => getProjectDoc(projectId), [projectId])
  const ready = useAtomValue(entry.readyAtom)
  return { root: entry.root, doc: entry.doc, ready }
}
