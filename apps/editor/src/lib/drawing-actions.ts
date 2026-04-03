import { appRegistry } from "./atom-registry"
import { setActiveToolAtom, setDrawingStateAtom } from "./path-atoms"
import { discardCurrentMaskAtom } from "./layer-atoms"
import { popHotkeyScope } from "../actors/hotkey-manager"

/** Finalize New Mask mode — commit the mask (Done) */
export function commitNewMask() {
  popHotkeyScope()
  appRegistry.set(setDrawingStateAtom, "idle")
  appRegistry.set(setActiveToolAtom, "select")
}

/** Finalize New Mask mode — discard the incomplete path */
export function discardNewMask() {
  popHotkeyScope()
  appRegistry.set(discardCurrentMaskAtom, undefined)
  appRegistry.set(setDrawingStateAtom, "idle")
  appRegistry.set(setActiveToolAtom, "select")
}
