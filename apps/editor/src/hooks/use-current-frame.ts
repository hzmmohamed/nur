import { useMemo } from "react"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { YAwareness } from "effect-yjs"
import type * as Y from "yjs"
import { AwarenessSchema, createCurrentFrameIndex } from "@nur/core"

const awarenessCache = new Map<Y.Doc, ReturnType<typeof createCurrentFrameIndex>>()

function getOrCreateFrameIndex(doc: Y.Doc) {
  let entry = awarenessCache.get(doc)
  if (!entry) {
    const awareness = YAwareness.make(AwarenessSchema, doc)
    awareness.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    entry = createCurrentFrameIndex(awareness)
    awarenessCache.set(doc, entry)
  }
  return entry
}

export function useCurrentFrame(doc: Y.Doc): {
  currentFrame: number
  setCurrentFrame: (index: number) => void
} {
  const { atom, set } = useMemo(() => getOrCreateFrameIndex(doc), [doc])
  const currentFrame = useAtomValue(atom) as number | undefined
  return { currentFrame: currentFrame ?? 0, setCurrentFrame: set }
}
