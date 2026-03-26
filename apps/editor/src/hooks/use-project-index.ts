import { useEffect, useMemo, useState } from "react"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { createProjectIndex, createProjectDoc, ProjectId, type ProjectMeta } from "@nur/core"
import * as S from "effect/Schema"

let _instance: ReturnType<typeof createProjectIndex> | null = null

function getProjectIndex() {
  if (!_instance) {
    _instance = createProjectIndex()
  }
  return _instance
}

const makeProjectId = S.decodeSync(ProjectId)

export function useProjectIndex() {
  const { root } = getProjectIndex()
  const projectsAtom = useMemo(() => root.focus("projects").atom(), [])
  const projects = useAtomValue(projectsAtom) as Record<string, ProjectMeta> | undefined
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const pi = getProjectIndex()
    pi.persistence.once("synced", () => {
      setReady(true)
    })
    if (pi.persistence.synced) {
      setReady(true)
    }
  }, [])

  const createProject = (name: string): string => {
    const id = makeProjectId(crypto.randomUUID())
    const now = Date.now()
    root.focus("projects").focus(id).syncSet({
      id,
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
    })
    const { root: projectRoot } = createProjectDoc(id)
    projectRoot.focus("name").syncSet(name.trim())
    return id
  }

  const deleteProject = (id: string) => {
    const current = root.focus("projects").syncGet() ?? {}
    const { [id]: _, ...rest } = current
    root.focus("projects").syncSet(rest)
  }

  return { projects: projects ?? {}, ready, createProject, deleteProject }
}
