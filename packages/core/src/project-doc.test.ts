import { describe, it, expect } from "vitest"
import { YDocument } from "effect-yjs"
import { ProjectDocSchema } from "./project-doc"

describe("ProjectDoc Y.Doc", () => {
  it("creates a Y.Doc with project name and empty frames", () => {
    const { root } = YDocument.make(ProjectDocSchema)
    expect(root.focus("name").syncGet()).toBeUndefined()
    expect(root.focus("frames").syncGet()).toEqual({})
  })

  it("can set project name", () => {
    const { root } = YDocument.make(ProjectDocSchema)
    root.focus("name").syncSet("My Animation")
    expect(root.focus("name").syncGet()).toBe("My Animation")
  })

  it("can add a frame", () => {
    const { root } = YDocument.make(ProjectDocSchema)
    root.focus("frames").focus("frame-001").syncSet({
      id: "frame-001",
      index: 0,
      contentHash: "sha256-abc123",
      width: 1920,
      height: 1080,
    })
    const frame = root.focus("frames").focus("frame-001").syncGet()!
    expect(frame.contentHash).toBe("sha256-abc123")
    expect(frame.width).toBe(1920)
  })
})
