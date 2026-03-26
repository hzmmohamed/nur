import type { YAwarenessHandle } from "effect-yjs"
import type { AwarenessState } from "./schemas/awareness"

export function createCurrentFrameIndex(awareness: YAwarenessHandle<AwarenessState>) {
  const atom = awareness.local.focus("currentFrame").atom()

  return {
    atom,
    get: (): number => awareness.local.focus("currentFrame").syncGet() ?? 0,
    set: (index: number): void => {
      awareness.local.focus("currentFrame").syncSet(index)
    },
  }
}
