import { canvasActor, CanvasEvent } from "./canvas-machine"

/** Finalize New Mask mode — commit the mask (Done) */
export function commitNewMask() {
  canvasActor?.sendSync(CanvasEvent.CommitMask)
}

/** Finalize New Mask mode — discard the incomplete path */
export function discardNewMask() {
  canvasActor?.sendSync(CanvasEvent.DiscardMask)
}
