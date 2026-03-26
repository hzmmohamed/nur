import { describe, it, expect } from "vitest"
import { hashBlob } from "./hash"
import * as Effect from "effect/Effect"

describe("hashBlob", () => {
  it("returns a consistent SHA-256 hex hash for the same data", async () => {
    const data = new Uint8Array([1, 2, 3, 4])
    const hash1 = await Effect.runPromise(hashBlob(data))
    const hash2 = await Effect.runPromise(hashBlob(data))
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/)
  })

  it("returns different hashes for different data", async () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([4, 5, 6])
    const hashA = await Effect.runPromise(hashBlob(a))
    const hashB = await Effect.runPromise(hashBlob(b))
    expect(hashA).not.toBe(hashB)
  })
})
