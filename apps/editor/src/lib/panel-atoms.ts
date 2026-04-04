import { Atom, Result } from "@effect-atom/atom"
import { framesAtom } from "./project-doc-atoms"
import { isDrawingAtom } from "./path-atoms"

/** Whether panels (sidebar, timeline) should be disabled/dimmed. */
export const panelsDisabledAtom = Atom.make((get): boolean => {
  const framesResult = get(framesAtom)
  const hasNoFrames = !Result.isSuccess(framesResult) || framesResult.value.length === 0
  const isDrawing = get(isDrawingAtom)
  return hasNoFrames || isDrawing
})
