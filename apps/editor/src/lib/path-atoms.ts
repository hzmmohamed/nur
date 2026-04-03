import { Atom, Result } from "@effect-atom/atom"
import { activeEntryAtom, projectDocRuntime } from "./project-doc-atoms"
import type { DrawingStateType } from "@nur/core"
import * as Effect from "effect/Effect"

/** Active tool — read/write from awareness. "select" | "pen" */
export const activeToolAtom = (() => {
  let toolAtom: Atom.Atom<string | undefined> | undefined
  return Atom.make((get): Result.Result<string> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as unknown as Result.Result<string>
    if (!toolAtom) toolAtom = result.value.awareness.local.focus("activeTool").atom()
    return Result.success((get(toolAtom) as string) ?? "select")
  })
})()

/** Active path ID — read/write from awareness. null = no path selected */
export const activePathIdAtom = (() => {
  let pathIdAtom: Atom.Atom<string | null | undefined> | undefined
  return Atom.make((get): Result.Result<string | null> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as unknown as Result.Result<string | null>
    if (!pathIdAtom) pathIdAtom = result.value.awareness.local.focus("activePathId").atom()
    return Result.success(get(pathIdAtom) as string | null)
  })
})()

/** Set active tool — writes to awareness */
export const setActiveToolAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (tool: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    entry.awareness.local.focus("activeTool").syncSet(tool)
  }),
)

/** Drawing state — read from awareness */
export const drawingStateAtom = (() => {
  let inner: Atom.Atom<DrawingStateType | undefined> | undefined
  return Atom.make((get): Result.Result<DrawingStateType> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as unknown as Result.Result<DrawingStateType>
    if (!inner) inner = result.value.awareness.local.focus("drawingState").atom() as Atom.Atom<DrawingStateType | undefined>
    return Result.success((get(inner) as DrawingStateType) ?? "idle")
  })
})()

/** Set drawing state — writes to awareness */
export const setDrawingStateAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (state: DrawingStateType, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    ;(entry.awareness.local.focus("drawingState") as any).syncSet(state)
  }),
)

/** Whether we're in the modal New Mask drawing mode */
export const isDrawingAtom = Atom.make((get): boolean => {
  const result = get(drawingStateAtom)
  return Result.isSuccess(result) && result.value !== "idle"
})

/** Set active path ID — writes to awareness */
export const setActivePathIdAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (pathId: string | null, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    ;(entry.awareness.local.focus("activePathId") as any).syncSet(pathId)
  }),
)
