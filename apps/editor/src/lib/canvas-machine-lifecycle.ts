/**
 * Lifecycle atom for the canvas state machine.
 * Separated from canvas-machine.ts to avoid circular imports
 * (canvas-machine ← layer-atoms → canvas-machine).
 */

import { Atom } from "@effect-atom/atom"
import { appRegistry } from "./atom-registry"
import { spawnCanvasMachine, canvasActor, CanvasEvent } from "./canvas-machine"
import { pushHotkeyScope, popHotkeyScope } from "../actors/hotkey-manager"
import { discardCurrentMaskAtom } from "./layer-atoms"

/**
 * Mount this atom to spawn the canvas machine actor.
 * Provides slot implementations for side effects.
 */
export const canvasMachineAtom = (() => {
  let cleanup: (() => void) | null = null
  return Atom.make(() => {
    if (cleanup) return

    cleanup = spawnCanvasMachine({
      pushDrawingHotkeys: () => {
        pushHotkeyScope({
          id: "drawing",
          bindings: [
            { key: "Escape", handler: () => canvasActor?.sendSync(CanvasEvent.DiscardMask) },
          ],
        })
      },
      popDrawingHotkeys: () => popHotkeyScope(),
      discardMaskData: () => appRegistry.set(discardCurrentMaskAtom, undefined),
    })
  })
})()
