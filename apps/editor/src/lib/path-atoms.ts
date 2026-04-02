import { Atom, Result } from "@effect-atom/atom"
import { projectDocEntryAtom, projectDocRuntime, getProjectDoc } from "./project-doc-atoms"
import * as Effect from "effect/Effect"

/** Active tool — read/write from awareness. "select" | "pen" */
export const activeToolAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocEntryAtom(projectId)
  let toolAtom: Atom.Atom<string | undefined> | undefined
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    if (!toolAtom) toolAtom = result.value.awareness.local.focus("activeTool").atom()
    return Result.success((get(toolAtom) as string) ?? "select")
  })
})

/** Active path ID — read/write from awareness. null = no path selected */
export const activePathIdAtom = Atom.family((projectId: string) => {
  const entryAtom = projectDocEntryAtom(projectId)
  let pathIdAtom: Atom.Atom<string | null | undefined> | undefined
  return Atom.make((get) => {
    const result = get(entryAtom)
    if (!Result.isSuccess(result)) return result
    if (!pathIdAtom) pathIdAtom = result.value.awareness.local.focus("activePathId").atom()
    return Result.success(get(pathIdAtom) as string | null)
  })
})

/** Set active tool — writes to awareness */
export const setActiveToolAtom = Atom.family((projectId: string) =>
  projectDocRuntime.fn(
    Effect.fnUntraced(function* (tool: string, get: Atom.FnContext) {
      const entry = yield* getProjectDoc(projectId)(get as any)
      entry.awareness.local.focus("activeTool").syncSet(tool)
    }),
  ),
)

/** Set active path ID — writes to awareness */
export const setActivePathIdAtom = Atom.family((projectId: string) =>
  projectDocRuntime.fn(
    Effect.fnUntraced(function* (pathId: string | null, get: Atom.FnContext) {
      const entry = yield* getProjectDoc(projectId)(get as any)
      ;(entry.awareness.local.focus("activePathId") as any).syncSet(pathId)
    }),
  ),
)
