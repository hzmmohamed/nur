import { Atom, Result } from "@effect-atom/atom"
import { createCurrentFrameIndex, ProjectId, ProjectDocSchema, type Frame, type AwarenessState } from "@nur/core"
import { makeYDocPersistence, type YDocPersistence } from "@nur/core"
import { YAwareness, YDocument, type YAwarenessHandle } from "effect-yjs"
import { AwarenessSchema } from "@nur/core"
import * as S from "effect/Schema"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Y from "yjs"
import { createModuleLogger } from "./logger"

const log = createModuleLogger("project-doc")
const parseProjectId = S.decodeSync(ProjectId)

// -- Types --

export interface ProjectDocEntry {
  readonly root: ReturnType<typeof YDocument.bind<typeof ProjectDocSchema.fields>>
  readonly doc: Y.Doc
  readonly persistence: YDocPersistence
  readonly awareness: YAwarenessHandle<AwarenessState>
  readonly currentFrameIndex: ReturnType<typeof createCurrentFrameIndex>
}

// -- Shared runtime --

export const projectDocRuntime = Atom.runtime(Layer.empty)

// -- Active project --

export const activeProjectIdAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)

// -- Project doc entry: one per project, scoped persistence --

export const projectDocEntryAtom: (projectId: string) => Atom.Atom<Result.Result<ProjectDocEntry>> = Atom.family((projectId: string) =>
  projectDocRuntime.atom(
    Effect.gen(function* () {
        log.withContext({ projectId }).info("creating Y.Doc")
        const id = parseProjectId(projectId)
        const doc = new Y.Doc()

        // Scoped persistence — hydrates doc from IndexedDB, attaches update handler
        // Scope finalization detaches handler and closes db
        const persistence = yield* makeYDocPersistence(`nur-project-${id}`, doc)

        // Bind lens AFTER hydration — sees full Y.Doc state
        // focus() lazily creates missing Yjs structures for new schema fields
        const root = YDocument.bind(ProjectDocSchema, doc)

        const rootMap = doc.getMap("root")
        const rawFramesYMap = rootMap.get("frames")
        const frameCount = rawFramesYMap instanceof Y.Map ? rawFramesYMap.size : 0
        log.withContext({ projectId, frameCount, docStateSize: Y.encodeStateAsUpdate(doc).byteLength }).info("entry ready")

        const awareness = YAwareness.make(AwarenessSchema, doc)
        awareness.local.syncSet({
          currentFrame: 0,
          activeTool: "select",
          activePathId: null,
          activeLayerId: null,
          drawingState: "idle",
          selection: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        })
        const currentFrameIndex = createCurrentFrameIndex(awareness)

        return { root, doc, persistence, awareness, currentFrameIndex } satisfies ProjectDocEntry
    }),
  ).pipe(Atom.keepAlive),
)

// -- Active project entry (reads activeProjectIdAtom) --

export const activeEntryAtom = Atom.make((get): Result.Result<ProjectDocEntry> => {
  const projectId = get(activeProjectIdAtom)
  if (!projectId) return Result.initial() as Result.Result<ProjectDocEntry>
  return get(projectDocEntryAtom(projectId))
})

// -- Derived atoms (scoped to active project) --

/** Project name, reactive from Y.Doc */
export const projectNameAtom = (() => {
  let nameAtom: ReturnType<ReturnType<ProjectDocEntry["root"]["focus"]>["atom"]> | undefined
  let lastProjectId: string | null = null
  return Atom.make((get) => {
    const projectId = get(activeProjectIdAtom)
    if (projectId !== lastProjectId) {
      nameAtom = undefined
      lastProjectId = projectId
    }
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result
    if (!nameAtom) nameAtom = result.value.root.focus("name").atom()
    return Result.success(get(nameAtom) as string | undefined)
  })
})()

/** Frames record from Y.Doc, sorted by index */
export const framesAtom = (() => {
  let rawAtom: ReturnType<ReturnType<ProjectDocEntry["root"]["focus"]>["atom"]> | undefined
  let lastProjectId: string | null = null
  return Atom.make((get) => {
    const projectId = get(activeProjectIdAtom)
    if (projectId !== lastProjectId) {
      rawAtom = undefined
      lastProjectId = projectId
    }
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) {
      log.withContext({ projectId, tag: result._tag }).debug("framesAtom: entry not ready")
      return result
    }
    if (!rawAtom) {
      rawAtom = result.value.root.focus("frames").atom()
      log.withContext({ projectId }).debug("framesAtom: created rawAtom")
    }
    const record = (get(rawAtom) as Record<string, Frame> | undefined) ?? {}
    const frames = Object.values(record).sort((a, b) => a.index - b.index)
    log.withContext({ projectId, frameCount: frames.length }).debug("framesAtom: computed")
    return Result.success(frames)
  })
})()

/** Current frame index, reactive from YAwareness */
export const currentFrameAtom = Atom.make((get) => {
  const result = get(activeEntryAtom)
  if (!Result.isSuccess(result)) return result
  return Result.success(get(result.value.currentFrameIndex.atom) as number ?? 0)
})

/** Setter for current frame */
export const setCurrentFrameAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (index: number, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    entry.currentFrameIndex.set(index)
  }),
)
