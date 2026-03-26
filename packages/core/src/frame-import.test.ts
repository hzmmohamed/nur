import { describe, it, expect } from "vitest"
import * as Effect from "effect/Effect"
import { YDocument } from "effect-yjs"
import { InMemoryBlobStore, BlobStore } from "@nur/object-store"
import { ProjectDocSchema } from "./project-doc"
import { importFrames, sortFramesByName } from "./frame-import"

describe("sortFramesByName", () => {
  it("sorts files numerically when names contain numbers", () => {
    const files = [
      { name: "frame10.png" },
      { name: "frame2.png" },
      { name: "frame1.png" },
    ] as Array<File>
    const sorted = sortFramesByName(files)
    expect(sorted.map((f) => f.name)).toEqual([
      "frame1.png",
      "frame2.png",
      "frame10.png",
    ])
  })
})

describe("importFrames", () => {
  const runWithStore = <A>(effect: Effect.Effect<A, never, BlobStore>) =>
    Effect.runPromise(effect.pipe(Effect.provide(InMemoryBlobStore)))

  it("imports image data and writes frame entries to Y.Doc", async () => {
    const { root } = YDocument.make(ProjectDocSchema)

    const result = await runWithStore(
      importFrames({
        files: [
          { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), name: "frame1.png", width: 100, height: 50 },
        ],
        projectRoot: root,
        startIndex: 0,
      })
    )

    expect(result).toHaveLength(1)
    expect(result[0].index).toBe(0)
    expect(result[0].width).toBe(100)
    expect(result[0].height).toBe(50)

    const frames = root.focus("frames").syncGet() ?? {}
    expect(Object.keys(frames)).toHaveLength(1)
  })

  it("assigns sequential indices starting from startIndex", async () => {
    const { root } = YDocument.make(ProjectDocSchema)

    const result = await runWithStore(
      importFrames({
        files: [
          { data: new Uint8Array([1]), name: "a.png", width: 100, height: 100 },
          { data: new Uint8Array([2]), name: "b.png", width: 100, height: 100 },
          { data: new Uint8Array([3]), name: "c.png", width: 100, height: 100 },
        ],
        projectRoot: root,
        startIndex: 5,
      })
    )

    expect(result.map((f) => f.index)).toEqual([5, 6, 7])
  })
})
