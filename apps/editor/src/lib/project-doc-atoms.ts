import { Atom, Result } from "@effect-atom/atom"
import { createProjectDoc, createCurrentFrameIndex, ProjectId, type Frame } from "@nur/core"
import { YAwareness } from "effect-yjs"
import { AwarenessSchema } from "@nur/core"
import * as S from "effect/Schema"
import * as Effect from "effect/Effect"
import * as Cache from "effect/Cache"
import * as Duration from "effect/Duration"
import * as Layer from "effect/Layer"

const parseProjectId = S.decodeSync(ProjectId)

// -- Types --

interface ProjectDocEntry {
  readonly root: ReturnType<typeof createProjectDoc>["root"]
  readonly doc: ReturnType<typeof createProjectDoc>["doc"]
  readonly persistence: ReturnType<typeof createProjectDoc>["persistence"]
  readonly awareness: ReturnType<typeof createCurrentFrameIndex>
}

// -- Shared runtime --

export const projectDocRuntime = Atom.runtime(Layer.empty)

// -- Cache atom: effectful construction, one Y.Doc per project --

const projectDocCacheAtom = projectDocRuntime.atom(
  Effect.gen(function* () {
    return yield* Cache.make({
      capacity: 64,
      timeToLive: Duration.infinity,
      lookup: (projectId: string) =>
        Effect.sync(() => {
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
          return { root, doc, persistence, awareness: frameIndex } satisfies ProjectDocEntry
        }),
    })
  }),
).pipe(Atom.keepAlive)

// -- Effect-returning helpers --

/** Get a project doc entry from the cache. Returns Effect needing Atom.Context. */
export const getProjectDoc = (projectId: string) =>
  Effect.fnUntraced(function* (get: Atom.Context) {
    const cache = yield* get.result(projectDocCacheAtom)
    return yield* cache.get(projectId)
  })

/** Wait for persistence sync. Returns Effect needing Atom.Context. */
export const syncProjectDoc = (projectId: string) =>
  Effect.fnUntraced(function* (get: Atom.Context) {
    const entry = yield* getProjectDoc(projectId)(get)
    yield* Effect.promise(() => entry.persistence.sync())
    return entry
  })

/** Flush Y.Doc state to IndexedDB. Returns Effect needing Atom.Context. */
export const flushProjectDoc = (projectId: string) =>
  Effect.fnUntraced(function* (get: Atom.Context) {
    const entry = yield* getProjectDoc(projectId)(get)
    yield* Effect.promise(() => entry.persistence.flush())
  })

// -- Shared entry atom per project (single cache lookup, shared across all derived atoms) --

const projectDocEntryAtom = Atom.family((projectId: string) =>
  projectDocRuntime.atom(getProjectDoc(projectId)),
)

// -- Atoms --

/** Whether IndexedDB persistence has synced for this project's Y.Doc */
export const projectReadyAtom = Atom.family((projectId: string) =>
  projectDocRuntime.atom(
    syncProjectDoc(projectId),
  ).pipe(Atom.mapResult(() => true)),
)

/** Project name, reactive from Y.Doc */
export const projectNameAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocEntryAtom(projectId)
  // Create inner atom once (lazily on first success), not on every recompute
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
    if (!Result.isSuccess(result)) return result
    if (!rawAtom) rawAtom = result.value.root.focus("frames").atom()
    const record = (get(rawAtom) as Record<string, Frame> | undefined) ?? {}
    return Result.success(Object.values(record).sort((a, b) => a.index - b.index))
  })
})

/** Current frame index, reactive from YAwareness */
export const currentFrameAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocEntryAtom(projectId)
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    // awareness.atom is already a stable reference, no need to cache
    return Result.success(get(result.value.awareness.atom) as number ?? 0)
  })
})

/** Setter for current frame — an atom fn that goes through the cache */
export const setCurrentFrameAtom = Atom.family((projectId: string) =>
  projectDocRuntime.fn(
    Effect.fnUntraced(function* (index: number, get: Atom.FnContext) {
      const cache = yield* get.result(projectDocCacheAtom)
      const entry = yield* cache.get(projectId)
      entry.awareness.set(index)
    }),
  ),
)
