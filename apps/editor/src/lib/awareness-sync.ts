/**
 * One-way sync: local atoms → awareness broadcast.
 *
 * Local atoms are the source of truth for all client interaction state.
 * This module subscribes to each local atom and broadcasts changes to
 * the awareness protocol so other clients can see presence info.
 */

import { Atom, Result } from "@effect-atom/atom"
import type { YAwarenessHandle } from "effect-yjs"
import type { AwarenessState } from "@nur/core"
import { activeToolRawAtom, activePathIdRawAtom, drawingStateRawAtom } from "./path-atoms"
import { activeLayerIdRawAtom } from "./layer-atoms"
import { activeEntryAtom, currentFrameRawAtom } from "./project-doc-atoms"
import { zoomRawAtom } from "./viewport-atoms"
import { appRegistry } from "./atom-registry"
import { createModuleLogger } from "./logger"

const log = createModuleLogger("awareness-sync")

function startSync(awareness: YAwarenessHandle<AwarenessState>): () => void {
  log.info("setting up awareness broadcast sync")

  const unsubs: Array<() => void> = []

  unsubs.push(appRegistry.subscribe(activeToolRawAtom, (tool) => {
    awareness.broadcastField("activeTool", tool)
  }))

  unsubs.push(appRegistry.subscribe(activePathIdRawAtom, (pathId) => {
    awareness.broadcastField("activePathId", pathId)
  }))

  unsubs.push(appRegistry.subscribe(drawingStateRawAtom, (state) => {
    awareness.broadcastField("drawingState", state as AwarenessState["drawingState"])
  }))

  unsubs.push(appRegistry.subscribe(activeLayerIdRawAtom, (layerId) => {
    awareness.broadcastField("activeLayerId", layerId)
  }))

  unsubs.push(appRegistry.subscribe(currentFrameRawAtom, (frame) => {
    awareness.broadcastField("currentFrame", frame)
  }))

  unsubs.push(appRegistry.subscribe(zoomRawAtom, (zoom) => {
    awareness.broadcastField("viewport", { x: 0, y: 0, zoom })
  }))

  log.info("awareness sync active — 6 subscriptions")

  return () => {
    unsubs.forEach((u) => u())
    log.info("awareness sync disposed")
  }
}

/** Lifecycle atom — starts awareness sync when project entry is ready */
export const awarenessSyncAtom = (() => {
  let cleanup: (() => void) | null = null
  return Atom.make((get) => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) {
      cleanup?.()
      cleanup = null
      return
    }
    if (!cleanup) {
      cleanup = startSync(result.value.awareness)
    }
  })
})()
