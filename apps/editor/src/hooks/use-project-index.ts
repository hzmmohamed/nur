import { Atom } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { BrowserKeyValueStore } from "@effect/platform-browser"
import { ProjectIndexSchema, ProjectId, type ProjectMeta, createProjectDoc, makeYDocPersistence } from "@nur/core"
import * as S from "effect/Schema"
import * as Effect from "effect/Effect"
import { appRegistry } from "../lib/atom-registry"
import { createModuleLogger } from "../lib/logger"

const logger = createModuleLogger("project-index")

const storageRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)

export const projectsAtom = Atom.kvs({
  runtime: storageRuntime,
  key: "nur-project-index",
  schema: ProjectIndexSchema,
  defaultValue: () => ({}) as S.Schema.Type<typeof ProjectIndexSchema>,
}).pipe(Atom.keepAlive)

const makeProjectId = S.decodeSync(ProjectId)

function createProject(name: string): string {
  const id = makeProjectId(crypto.randomUUID())
  const now = Date.now()
  const trimmed = name.trim()
  logger.withMetadata({ id, name: trimmed }).info("Creating project")

  const current = appRegistry.get(projectsAtom)
  appRegistry.set(projectsAtom, {
    ...current,
    [id]: { id, name: trimmed, createdAt: now, updatedAt: now } as ProjectMeta,
  })

  // Create doc, set name, persist initial state, then release scope
  const { doc, root } = createProjectDoc(id)
  root.focus("name").syncSet(trimmed)
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const persistence = yield* makeYDocPersistence(`nur-project-${id}`, doc)
        yield* persistence.flush()
      }),
    ),
  )

  return id
}

function deleteProject(id: string) {
  logger.withMetadata({ id }).info("Deleting project")
  const { [id]: _, ...rest } = appRegistry.get(projectsAtom)
  appRegistry.set(projectsAtom, rest)
}

export function useProjectIndex() {
  const projects = useAtomValue(projectsAtom)
  return { projects, createProject, deleteProject }
}
