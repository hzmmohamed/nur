import { Atom, Result } from "@effect-atom/atom"
import { createProjectDoc, createCurrentFrameIndex, ProjectId, type Frame, type AwarenessState } from "@nur/core"
import { YAwareness, type YAwarenessHandle } from "effect-yjs"
import { AwarenessSchema } from "@nur/core"
import * as S from "effect/Schema"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createModuleLogger } from "./logger"

const log = createModuleLogger("project-doc")
const parseProjectId = S.decodeSync(ProjectId)

// -- Types --

export interface ProjectDocEntry {
  readonly root: ReturnType<typeof createProjectDoc>["root"]
  readonly doc: ReturnType<typeof createProjectDoc>["doc"]
  readonly persistence: ReturnType<typeof createProjectDoc>["persistence"]
  readonly awareness: YAwarenessHandle<AwarenessState>
  readonly currentFrameIndex: ReturnType<typeof createCurrentFrameIndex>
}

// -- Shared runtime --

export const projectDocRuntime = Atom.runtime(Layer.empty)

// -- Project doc entry: one per project, includes persistence sync --

export const projectDocEntryAtom = Atom.family((projectId: string) =>
  projectDocRuntime.atom(
    Effect.gen(function* () {
      log.withContext({ projectId }).info("creating Y.Doc")
      const id = parseProjectId(projectId)
      const { doc, root, persistence } = createProjectDoc(id)

      log.withContext({ projectId }).info("starting persistence.sync()")
      yield* Effect.promise(() => persistence.sync())

      const rawFrames = root.focus("frames").syncGet()
      const frameKeys = rawFrames ? Object.keys(rawFrames) : []
      log.withContext({ projectId, frameCount: frameKeys.length }).info("sync complete")

      const awareness = YAwareness.make(AwarenessSchema, doc)
      awareness.local.syncSet({
        currentFrame: 0,
        activeTool: "select",
        activePathId: null,
        selection: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      })
      const currentFrameIndex = createCurrentFrameIndex(awareness)
      log.withContext({ projectId }).info("entry ready")
      return { root, doc, persistence, awareness, currentFrameIndex } satisfies ProjectDocEntry
    }),
  ).pipe(Atom.keepAlive),
)

// -- Effect-returning helpers --

/** Flush Y.Doc state to IndexedDB. */
export const flushProjectDoc = (projectId: string) =>
  Effect.fnUntraced(function* (get: Atom.Context) {
    const entry = yield* get.result(projectDocEntryAtom(projectId))
    yield* Effect.promise(() => entry.persistence.flush())
  })

// -- Derived atoms --

/** Project name, reactive from Y.Doc */
export const projectNameAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocEntryAtom(projectId)
  let nameAtom: ReturnType<ReturnType<ProjectDocEntry["root"]["focus"]>["atom"]> | undefined
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    if (!nameAtom) nameAtom = result.value.root.focus("name").atom()
    return Result.success(get(nameAtom) as string | undefined)
  })
})

/** Frames record from Y.Doc, sorted by index */
export const framesAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocEntryAtom(projectId)
  let rawAtom: ReturnType<ReturnType<ProjectDocEntry["root"]["focus"]>["atom"]> | undefined
  return Atom.make((get) => {
    const result = get(entryAtom)
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
})

/** Current frame index, reactive from YAwareness */
export const currentFrameAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocEntryAtom(projectId)
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    return Result.success(get(result.value.currentFrameIndex.atom) as number ?? 0)
  })
})

/** Setter for current frame */
export const setCurrentFrameAtom = Atom.family((projectId: string) =>
  projectDocRuntime.fn(
    Effect.fnUntraced(function* (index: number, get: Atom.FnContext) {
      const entry = yield* get.result(projectDocEntryAtom(projectId))
      entry.currentFrameIndex.set(index)
    }),
  ),
)
