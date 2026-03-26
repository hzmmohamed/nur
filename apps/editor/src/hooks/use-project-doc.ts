import { useEffect, useState } from "react"
import { createProjectDoc } from "@nur/core"

const cache = new Map<string, ReturnType<typeof createProjectDoc>>()

function getProjectDoc(projectId: string) {
  let instance = cache.get(projectId)
  if (!instance) {
    instance = createProjectDoc(projectId)
    cache.set(projectId, instance)
  }
  return instance
}

export function useProjectDoc(projectId: string) {
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
