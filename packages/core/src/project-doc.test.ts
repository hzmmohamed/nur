import { describe, it, expect } from "vitest"
import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { ProjectDocSchema } from "./project-doc"
import { FrameSchema, type Frame } from "./schemas/frame"

const VALID_FRAME_ID = "550e8400-e29b-41d4-a716-446655440000"

const makeFrame = (overrides: Partial<Record<string, unknown>> = {}): Frame =>
  S.decodeUnknownSync(FrameSchema)({
    id: VALID_FRAME_ID,
    index: 0,
    contentHash: "sha256-abc123",
    width: 1920,
    height: 1080,
    ...overrides,
  })

describe("ProjectDoc Y.Doc", () => {
  it("creates a Y.Doc with undefined name and empty frames", () => {
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
    const frame = makeFrame()
    root.focus("frames").focus(VALID_FRAME_ID).syncSet(frame)
    const stored = root.focus("frames").focus(VALID_FRAME_ID).syncGet()!
    expect(stored.contentHash).toBe("sha256-abc123")
    expect(stored.width).toBe(1920)
  })

  it("rejects frame with negative dimensions", () => {
    expect(() => makeFrame({ width: -1 })).toThrow()
  })

  it("rejects frame with non-integer index", () => {
    expect(() => makeFrame({ index: 1.5 })).toThrow()
  })
})
