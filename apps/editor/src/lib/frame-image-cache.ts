import * as Effect from "effect/Effect"
import { BlobStore } from "@nur/object-store"
import { AppBlobStore } from "./blob-store-layer"

const imageCache = new Map<string, HTMLImageElement>()

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

export const getCachedFrameImage = (contentHash: string): HTMLImageElement | undefined =>
  imageCache.get(contentHash)

export const loadAndCacheFrameImage = (contentHash: string): Promise<HTMLImageElement> => {
  const cached = imageCache.get(contentHash)
  if (cached) return Promise.resolve(cached)

  const program = Effect.gen(function* () {
    const store = yield* BlobStore
    return yield* store.get(contentHash)
  }).pipe(Effect.provide(AppBlobStore))

  return Effect.runPromise(program).then((data) => {
    if (!data) throw new Error(`Blob not found: ${contentHash}`)
    return decodeImage(data).then((img) => {
      imageCache.set(contentHash, img)
      return img
    })
  })
}
