import { Atom, Result } from "@effect-atom/atom"
import { currentFrameAtom, framesAtom } from "./project-doc-atoms"
import { layersAtom } from "./layer-atoms"
import type { Frame } from "@nur/core"

export interface MaskSpec {
  pathKey: string
  layerId: string
  frameId: string
  maskId: string
  color: string
}

/**
 * Derived atom: computes which masks should be visible on the canvas.
 * Fires when frame changes, layers change, or masks are added/removed.
 */
export const visibleMasksAtom = Atom.make((get): Result.Result<Record<string, MaskSpec>> => {
  const framesResult = get(framesAtom)
  if (!Result.isSuccess(framesResult)) return framesResult as Result.Result<Record<string, MaskSpec>>

  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(currentResult)) return currentResult as Result.Result<Record<string, MaskSpec>>
  const currentIdx = currentResult.value

  const frames = framesResult.value as Frame[]
  const frame = frames.find((f) => f.index === currentIdx)
  if (!frame) return Result.success({})

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return layersResult as Result.Result<Record<string, MaskSpec>>
  const layers = layersResult.value

  const specs: Record<string, MaskSpec> = {}

  for (const layer of layers) {
    const masks = (layer as any).masks as Record<string, Record<string, unknown>> | undefined
    if (!masks || typeof masks !== "object") continue

    const frameMasks = masks[frame.id]
    if (!frameMasks || typeof frameMasks !== "object") continue

    for (const maskId of Object.keys(frameMasks)) {
      const pathKey = `${layer.id}:${frame.id}:${maskId}`
      specs[pathKey] = {
        pathKey,
        layerId: layer.id,
        frameId: frame.id,
        maskId,
        color: layer.color ?? "#888",
      }
    }
  }

  return Result.success(specs)
})
