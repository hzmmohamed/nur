import { Context, Effect } from "effect"
import { BlobStore } from "./blob-store"

export type ImageVariant = "full" | "thumb"

const THUMB_MAX_WIDTH = 200
const THUMB_QUALITY = 0.8
const INDEX_DB_NAME = "nur-image-index"
const INDEX_STORE_NAME = "thumb-index"

export class ImageStore extends Context.Tag("@nur/ImageStore")<
  ImageStore,
  {
    /** Store an image and eagerly generate thumbnail. Returns the content hash. */
    readonly putImage: (data: Uint8Array) => Effect.Effect<string, never, BlobStore>
    /** Get an image variant by content hash. */
    readonly getImage: (hash: string, variant: ImageVariant) => Effect.Effect<Uint8Array | undefined, never, BlobStore>
  }
>() {}

/** Generate a JPEG thumbnail from image data */
function generateThumbnail(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([data])
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, THUMB_MAX_WIDTH / img.naturalWidth)
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)

      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, w, h)

      canvas.toBlob(
        (result) => {
          if (!result) return reject(new Error("Failed to generate thumbnail"))
          result.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)))
        },
        "image/jpeg",
        THUMB_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to load image for thumbnail"))
    }
    img.src = url
  })
}

/**
 * Thumbnail index — maps originalHash → thumbHash.
 * Persisted in its own IndexedDB store, separate from the blob store.
 */
class ThumbIndex {
  private cache = new Map<string, string>()
  private dbPromise: Promise<IDBDatabase> | null = null

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(INDEX_DB_NAME, 1)
        request.onupgradeneeded = () => {
          request.result.createObjectStore(INDEX_STORE_NAME)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }
    return this.dbPromise
  }

  async set(originalHash: string, thumbHash: string): Promise<void> {
    this.cache.set(originalHash, thumbHash)
    const db = await this.getDb()
    const tx = db.transaction(INDEX_STORE_NAME, "readwrite")
    tx.objectStore(INDEX_STORE_NAME).put(thumbHash, originalHash)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async get(originalHash: string): Promise<string | undefined> {
    const cached = this.cache.get(originalHash)
    if (cached) return cached

    const db = await this.getDb()
    const tx = db.transaction(INDEX_STORE_NAME, "readonly")
    const request = tx.objectStore(INDEX_STORE_NAME).get(originalHash)
    const result = await new Promise<string | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? undefined)
      request.onerror = () => reject(request.error)
    })
    if (result) this.cache.set(originalHash, result)
    return result
  }
}

/** Create the ImageStore service implementation */
export const ImageStoreLive = Effect.gen(function* () {
  const store = yield* BlobStore
  const index = new ThumbIndex()

  const impl: Context.Tag.Service<typeof ImageStore> = {
    putImage: (data) =>
      Effect.gen(function* () {
        // Store full image (content-addressed)
        const hash = yield* store.put(data)

        // Generate thumbnail and store it (also content-addressed)
        const thumbData = yield* Effect.promise(() => generateThumbnail(data))
        const thumbHash = yield* store.put(thumbData)

        // Record the mapping
        yield* Effect.promise(() => index.set(hash, thumbHash))

        return hash
      }),

    getImage: (hash, variant) =>
      variant === "full"
        ? store.get(hash)
        : Effect.gen(function* () {
            const thumbHash = yield* Effect.promise(() => index.get(hash))
            if (!thumbHash) return undefined
            return yield* store.get(thumbHash)
          }),
  }

  return impl
})
