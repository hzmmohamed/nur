import { useEffect, useState } from "react"
import { createProjectIndex, type ProjectMeta } from "@nur/core"

let _instance: ReturnType<typeof createProjectIndex> | null = null

function getProjectIndex() {
  if (!_instance) {
    _instance = createProjectIndex()
  }
  return _instance
}

export function useProjectIndex() {
  const { root, doc } = getProjectIndex()
  const [projects, setProjects] = useState<Record<string, ProjectMeta>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const update = () => {
      const data = root.focus("projects").syncGet() ?? {}
      setProjects(data)
    }

    doc.on("update", update)

    const pi = getProjectIndex()
    pi.persistence.once("synced", () => {
      update()
      setReady(true)
    })

    update()

    return () => {
      doc.off("update", update)
    }
  }, [])

  const createProject = (name: string): string => {
    const id = crypto.randomUUID()
    const now = Date.now()
    root.focus("projects").focus(id).syncSet({
      id,
      name,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  const deleteProject = (id: string) => {
    const current = root.focus("projects").syncGet() ?? {}
    const { [id]: _, ...rest } = current
    root.focus("projects").syncSet(rest)
  }

  return { projects, ready, createProject, deleteProject }
}
