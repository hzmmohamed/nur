import { Atom, Result } from "@effect-atom/atom"

// ── Source-of-truth atoms ───────────────────────────────────

/** Canvas zoom level — source of truth */
export const zoomRawAtom = Atom.make<number>(1)

/** Canvas zoom (Result-wrapped for consumer compatibility) */
export const zoomAtom = Atom.make((get): Result.Result<number> => {
  return Result.success(get(zoomRawAtom))
})

/** Set zoom — alias for zoomRawAtom */
export const setZoomAtom = zoomRawAtom

/**
 * Signal atom — increment to trigger a view reset (zoom 1 + center stage).
 * The canvas-atom subscribes to this and resets position when it changes.
 */
export const resetViewSignalAtom = Atom.make(0)
