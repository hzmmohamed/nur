import { Atom } from "@effect-atom/atom"
import { ImageStore } from "@nur/object-store"
import * as Effect from "effect/Effect"
import { AppBlobStore } from "./blob-store-layer"

const thumbRuntime = Atom.runtime(AppBlobStore)

/** Load a thumbnail image by content hash. Returns an object URL. */
export const thumbnailAtom = Atom.family((contentHash: string) =>
  thumbRuntime.atom(
    Effect.gen(function* () {
      const imageStore = yield* ImageStore
      const data = yield* imageStore.getImage(contentHash, "thumb")
      if (!data) return undefined
      const blob = new Blob([data], { type: "image/jpeg" })
      return URL.createObjectURL(blob)
    }),
  ),
)
