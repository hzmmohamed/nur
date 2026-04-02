import * as Effect from "effect/Effect"
import * as S from "effect/Schema"
import type { YDocumentRoot } from "effect-yjs"
import { BlobStore } from "@nur/object-store"
import { FrameId } from "./schemas/ids"
import type { Frame } from "./schemas/frame"
import type { ProjectDoc } from "./project-doc"

const makeFrameId = S.decodeSync(FrameId)

export interface PreparedFrame {
  readonly data: Uint8Array
  readonly name: string
  readonly width: number
  readonly height: number
}

export function sortFramesByName<T extends { name: string }>(files: Array<T>): Array<T> {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  )
}

export const importFrames = (params: {
  readonly files: ReadonlyArray<PreparedFrame>
  readonly projectRoot: YDocumentRoot<ProjectDoc>
  readonly startIndex: number
}): Effect.Effect<Array<Frame>, never, BlobStore> => {
  const { files, projectRoot, startIndex } = params

  return Effect.gen(function* () {
    const store = yield* BlobStore

    return yield* Effect.forEach(files, (file, idx) =>
      Effect.gen(function* () {
        const contentHash = yield* store.put(file.data)
        const id = makeFrameId(crypto.randomUUID())
        const frame: Frame = {
          id,
          index: startIndex + idx,
          contentHash: contentHash as Frame["contentHash"],
          width: file.width,
          height: file.height,
          paths: {},
        }
        projectRoot.focus("frames").focus(id).syncSet(frame)
        return frame
      })
    )
  })
}
