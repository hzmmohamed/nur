import { Atom, Result } from "@effect-atom/atom"
import type { DrawingStateType } from "@nur/core"
import { canvasMachineStateAtom } from "./canvas-machine"

// ── Derived from canvas machine state — do not set directly ──

/** @derived from canvas machine — do not set directly */
export const activeToolRawAtom = Atom.make((get): string => {
  const state = get(canvasMachineStateAtom)
  return state._tag === "NewMask" || state._tag === "NewMaskClosed" ? "pen" : "select"
})

/** @derived from canvas machine — do not set directly */
export const activePathIdRawAtom = Atom.make<string | null>(null)

/** @derived from canvas machine — do not set directly */
export const drawingStateRawAtom = Atom.make((get): DrawingStateType => {
  const state = get(canvasMachineStateAtom)
  if (state._tag === "NewMask") return "drawing"
  if (state._tag === "NewMaskClosed") return "closed"
  return "idle"
})

// ── Result-wrapped read atoms (for consumer compatibility) ──

/** Active tool (Result-wrapped for components using Result.isSuccess pattern) */
export const activeToolAtom = Atom.make((get): Result.Result<string> => {
  return Result.success(get(activeToolRawAtom))
})

/** Active path ID (Result-wrapped) */
export const activePathIdAtom = Atom.make((get): Result.Result<string | null> => {
  return Result.success(get(activePathIdRawAtom))
})

/** Drawing state (Result-wrapped) */
export const drawingStateAtom = Atom.make((get): Result.Result<DrawingStateType> => {
  return Result.success(get(drawingStateRawAtom))
})

/** Whether we're in the modal New Mask drawing mode */
export const isDrawingAtom = Atom.make((get): boolean => {
  const state = get(canvasMachineStateAtom)
  return state._tag === "NewMask" || state._tag === "NewMaskClosed"
})

