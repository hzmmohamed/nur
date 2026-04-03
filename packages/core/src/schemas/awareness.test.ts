import { describe, it, expect } from "vitest"
import * as Y from "yjs"
import { YAwareness } from "effect-yjs"
import { AwarenessSchema } from "./awareness"

describe("AwarenessSchema", () => {
  it("creates awareness handle from Y.Doc", () => {
    const doc = new Y.Doc()
    const handle = YAwareness.make(AwarenessSchema, doc)
    expect(handle.clientID).toBeGreaterThan(0)
  })

  it("can set and read local awareness state", () => {
    const doc = new Y.Doc()
    const handle = YAwareness.make(AwarenessSchema, doc)
    handle.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      activePathId: null,
      activeLayerId: null,
      drawingState: "idle",
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    const state = handle.local.syncGet()!
    expect(state.currentFrame).toBe(0)
    expect(state.activeTool).toBe("select")
    expect(state.viewport.zoom).toBe(1)
  })

  it("can update individual fields via focus", () => {
    const doc = new Y.Doc()
    const handle = YAwareness.make(AwarenessSchema, doc)
    handle.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      activePathId: null,
      activeLayerId: null,
      drawingState: "idle",
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    handle.local.focus("currentFrame").syncSet(5)
    expect(handle.local.focus("currentFrame").syncGet()).toBe(5)
  })

  it("rejects negative frame index", () => {
    const doc = new Y.Doc()
    const handle = YAwareness.make(AwarenessSchema, doc)
    expect(() =>
      handle.local.syncSet({
        currentFrame: -1,
        activeTool: "select",
        selection: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      })
    ).toThrow()
  })

  it("rejects zero zoom", () => {
    const doc = new Y.Doc()
    const handle = YAwareness.make(AwarenessSchema, doc)
    expect(() =>
      handle.local.syncSet({
        currentFrame: 0,
        activeTool: "select",
        selection: [],
        viewport: { x: 0, y: 0, zoom: 0 },
      })
    ).toThrow()
  })
})
