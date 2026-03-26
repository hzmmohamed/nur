import * as Effect from "effect/Effect"

export const hashBlob = (data: Uint8Array): Effect.Effect<string> =>
  Effect.promise(async () => {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = new Uint8Array(hashBuffer)
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  })
