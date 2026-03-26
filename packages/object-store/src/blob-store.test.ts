import { describe, it, expect } from "vitest"
import * as Effect from "effect/Effect"
import { BlobStore, InMemoryBlobStore } from "./blob-store"

describe("BlobStore", () => {
  const runWithStore = <A>(effect: Effect.Effect<A, never, BlobStore>) =>
    Effect.runPromise(effect.pipe(Effect.provide(InMemoryBlobStore)))

  it("stores and retrieves a blob by content hash", async () => {
    const data = new Uint8Array([10, 20, 30])
    const result = await runWithStore(
      Effect.gen(function* () {
        const store = yield* BlobStore
        const hash = yield* store.put(data)
        expect(hash).toMatch(/^[a-f0-9]{64}$/)
        return yield* store.get(hash)
      })
    )
    expect(result).toEqual(new Uint8Array([10, 20, 30]))
  })

  it("returns the same hash for identical content", async () => {
    await runWithStore(
      Effect.gen(function* () {
        const store = yield* BlobStore
        const data = new Uint8Array([10, 20, 30])
        const hash1 = yield* store.put(data)
        const hash2 = yield* store.put(data)
        expect(hash1).toBe(hash2)
      })
    )
  })

  it("returns undefined for non-existent hash", async () => {
    const result = await runWithStore(
      Effect.gen(function* () {
        const store = yield* BlobStore
        return yield* store.get("nonexistent")
      })
    )
    expect(result).toBeUndefined()
  })

  it("reports existence correctly", async () => {
    await runWithStore(
      Effect.gen(function* () {
        const store = yield* BlobStore
        const data = new Uint8Array([1, 2, 3])
        const hash = yield* store.put(data)
        expect(yield* store.has(hash)).toBe(true)
        expect(yield* store.has("nonexistent")).toBe(false)
      })
    )
  })

  it("deletes a blob", async () => {
    await runWithStore(
      Effect.gen(function* () {
        const store = yield* BlobStore
        const data = new Uint8Array([1, 2, 3])
        const hash = yield* store.put(data)
        yield* store.delete(hash)
        expect(yield* store.has(hash)).toBe(false)
      })
    )
  })
})
