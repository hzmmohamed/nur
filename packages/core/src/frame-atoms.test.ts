import { describe, it, expect } from "vitest"
import * as Y from "yjs"
import { YAwareness } from "effect-yjs"
import { AwarenessSchema } from "./schemas/awareness"
import { createCurrentFrameIndex } from "./frame-atoms"

describe("currentFrameIndex atom", () => {
  it("reads initial value from awareness", () => {
    const doc = new Y.Doc()
    const awareness = YAwareness.make(AwarenessSchema, doc)
    awareness.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      activePathId: null,
      activeLayerId: null,
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    const { get } = createCurrentFrameIndex(awareness)
    expect(get()).toBe(0)
  })

  it("updates awareness when set", () => {
    const doc = new Y.Doc()
    const awareness = YAwareness.make(AwarenessSchema, doc)
    awareness.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      activePathId: null,
      activeLayerId: null,
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    const { get, set } = createCurrentFrameIndex(awareness)
    set(5)
    expect(awareness.local.focus("currentFrame").syncGet()).toBe(5)
    expect(get()).toBe(5)
  })
})
