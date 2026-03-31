import * as Effect from "effect/Effect"
import { Atom } from "@effect-atom/atom"
import { BlobStore } from "@nur/object-store"
import { AppBlobStore } from "./blob-store-layer"

const decodeImage = (data: Uint8Array): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const blob = new Blob([data])
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to decode image"))
    }
    img.src = url
  })

const storageRuntime = Atom.runtime(AppBlobStore)

export const frameImageAtom = Atom.family((contentHash: string) =>
  storageRuntime.atom(
    Effect.gen(function* () {
      const store = yield* BlobStore
      const data = yield* store.get(contentHash)
      if (!data) return yield* Effect.fail(new Error(`Blob not found: ${contentHash}`))
      return yield* Effect.promise(() => decodeImage(data))
    }),
  ).pipe(Atom.setIdleTTL("5 minutes")),
)
