import { Atom } from "@effect-atom/atom"
import { createProjectDoc, createCurrentFrameIndex, ProjectId, type Frame } from "@nur/core"
import { YAwareness } from "effect-yjs"
import { AwarenessSchema } from "@nur/core"
import * as S from "effect/Schema"

const parseProjectId = S.decodeSync(ProjectId)

// -- Internal cache: one Y.Doc per project --

interface ProjectDocEntry {
  readonly root: ReturnType<typeof createProjectDoc>["root"]
  readonly doc: ReturnType<typeof createProjectDoc>["doc"]
  readonly persistence: ReturnType<typeof createProjectDoc>["persistence"]
  readonly awareness: ReturnType<typeof createCurrentFrameIndex>
  readonly syncPromise: Promise<void>
}

const docCache = new Map<string, ProjectDocEntry>()

// No beforeunload flush — individual storeUpdate calls already persist data.
// flush() does clear+write which is unsafe in beforeunload (clear may commit
// but write may not, leaving an empty database).

function getOrCreateProjectDoc(projectId: string): ProjectDocEntry {
  let entry = docCache.get(projectId)
  if (!entry) {
    const id = parseProjectId(projectId)
    const { doc, root, persistence } = createProjectDoc(id)
    const awareness = YAwareness.make(AwarenessSchema, doc)
    awareness.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    const frameIndex = createCurrentFrameIndex(awareness)
    const syncPromise = persistence.sync()
    entry = { root, doc, persistence, awareness: frameIndex, syncPromise }
    docCache.set(projectId, entry)
  }
  return entry
}

/** Public accessor for non-React code (import-atoms needs the root) */
export function getProjectDocRoot(projectId: string) {
  return getOrCreateProjectDoc(projectId).root
}

/** Wait for persistence sync before writing */
export function waitForPersistence(projectId: string): Promise<void> {
  return getOrCreateProjectDoc(projectId).syncPromise
}

/** Force flush Y.Doc state to IndexedDB */
export function flushProjectDoc(projectId: string): Promise<void> {
  return getOrCreateProjectDoc(projectId).persistence.flush()
}

// -- Atoms --

/** Whether IndexedDB persistence has synced for this project's Y.Doc */
export const projectReadyAtom = Atom.family((projectId: string) =>
  Atom.make((get) => {
    const { syncPromise } = getOrCreateProjectDoc(projectId)
    let synced = false
    syncPromise.then(() => {
      synced = true
      get.setSelf(true)
    })
    return synced
  }),
)

/** Project name, reactive from Y.Doc */
export const projectNameAtom = Atom.family((projectId: string) => {
  const { root } = getOrCreateProjectDoc(projectId)
  return root.focus("name").atom()
})

/** Frames record from Y.Doc, sorted by index */
export const framesAtom = Atom.family((projectId: string) => {
  const { root } = getOrCreateProjectDoc(projectId)
  const rawAtom = root.focus("frames").atom()
  return Atom.make((get) => {
    const record = (get(rawAtom) as Record<string, Frame> | undefined) ?? {}
    return Object.values(record).sort((a, b) => a.index - b.index)
  })
})

/** Current frame index, reactive from YAwareness */
export const currentFrameAtom = Atom.family((projectId: string) => {
  const { awareness } = getOrCreateProjectDoc(projectId)
  return Atom.map(awareness.atom, (v) => (v as number | undefined) ?? 0)
})

/** Setter for current frame -- synchronous, for use from React and atoms */
export function setCurrentFrame(projectId: string, index: number) {
  const { awareness } = getOrCreateProjectDoc(projectId)
  awareness.set(index)
}
