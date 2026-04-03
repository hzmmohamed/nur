import { Atom, Result } from "@effect-atom/atom"
import { activeEntryAtom, projectDocRuntime } from "./project-doc-atoms"
import * as Effect from "effect/Effect"

/** Canvas zoom level — read from awareness viewport.zoom */
export const zoomAtom = (() => {
  let inner: Atom.Atom<number | undefined> | undefined
  return Atom.make((get): Result.Result<number> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as unknown as Result.Result<number>
    if (!inner) inner = result.value.awareness.local.focus("viewport").focus("zoom").atom() as Atom.Atom<number | undefined>
    return Result.success((get(inner) as number) ?? 1)
  })
})()

/** Set zoom — writes to awareness viewport.zoom */
export const setZoomAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (zoom: number, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    ;(entry.awareness.local.focus("viewport").focus("zoom") as any).syncSet(zoom)
  }),
)

/**
 * Signal atom — increment to trigger a view reset (zoom 1 + center stage).
 * The canvas-atom subscribes to this and resets position when it changes.
 */
export const resetViewSignalAtom = Atom.make(0)
