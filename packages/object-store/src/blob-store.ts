import { Context, Effect, Layer } from "effect"
import * as MutableHashMap from "effect/MutableHashMap"
import { hashBlob } from "./hash"

export class BlobStore extends Context.Tag("@nur/BlobStore")<
  BlobStore,
  {
    readonly put: (data: Uint8Array) => Effect.Effect<string>
    readonly get: (hash: string) => Effect.Effect<Uint8Array | undefined>
    readonly has: (hash: string) => Effect.Effect<boolean>
    readonly delete: (hash: string) => Effect.Effect<void>
  }
>() {}

export const InMemoryBlobStore: Layer.Layer<BlobStore> = Layer.sync(BlobStore, () => {
  const blobs = MutableHashMap.empty<string, Uint8Array>()
  return {
    put: (data) =>
      Effect.flatMap(hashBlob(data), (hash) =>
        Effect.sync(() => {
          MutableHashMap.set(blobs, hash, data)
          return hash
        })
      ),
    get: (hash) =>
      Effect.sync(() => {
        const result = MutableHashMap.get(blobs, hash)
        return result._tag === "Some" ? result.value : undefined
      }),
    has: (hash) =>
      Effect.sync(() => MutableHashMap.has(blobs, hash)),
    delete: (hash) =>
      Effect.sync(() => {
        MutableHashMap.remove(blobs, hash)
      }),
  }
})

export const IndexedDBBlobStore = (dbName: string): Layer.Layer<BlobStore> =>
  Layer.sync(BlobStore, () => {
    let dbPromise: Promise<IDBDatabase> | null = null

    const getDb = (): Promise<IDBDatabase> => {
      if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
          const request = indexedDB.open(dbName, 1)
          request.onupgradeneeded = () => {
            request.result.createObjectStore("blobs")
          }
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      }
      return dbPromise
    }

    return {
      put: (data) =>
        Effect.flatMap(hashBlob(data), (hash) =>
          Effect.promise(async () => {
            const db = await getDb()
            const tx = db.transaction("blobs", "readwrite")
            tx.objectStore("blobs").put(data, hash)
            await new Promise<void>((resolve, reject) => {
              tx.oncomplete = () => resolve()
              tx.onerror = () => reject(tx.error)
            })
            return hash
          })
        ),
      get: (hash) =>
        Effect.promise(async () => {
          const db = await getDb()
          const tx = db.transaction("blobs", "readonly")
          const request = tx.objectStore("blobs").get(hash)
          return new Promise<Uint8Array | undefined>((resolve, reject) => {
            request.onsuccess = () =>
              resolve(request.result ? new Uint8Array(request.result) : undefined)
            request.onerror = () => reject(request.error)
          })
        }),
      has: (hash) =>
        Effect.promise(async () => {
          const db = await getDb()
          const tx = db.transaction("blobs", "readonly")
          const request = tx.objectStore("blobs").count(IDBKeyRange.only(hash))
          return new Promise<boolean>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result > 0)
            request.onerror = () => reject(request.error)
          })
        }),
      delete: (hash) =>
        Effect.promise(async () => {
          const db = await getDb()
          const tx = db.transaction("blobs", "readwrite")
          tx.objectStore("blobs").delete(hash)
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
          })
        }),
    }
  })
