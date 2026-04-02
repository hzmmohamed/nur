import * as Effect from "effect/Effect"
import { Atom } from "@effect-atom/atom"
import { BlobStore } from "@nur/object-store"
import { sortFramesByName, type Frame } from "@nur/core"
import { FrameId } from "@nur/core"
import * as S from "effect/Schema"
import { AppBlobStore } from "./blob-store-layer"
import { appRegistry } from "./atom-registry"
import { activeEntryAtom } from "./project-doc-atoms"

// -- Helpers --

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load: ${file.name}`))
    }
    img.src = url
  })
}

// -- Types --

export interface ImportProgress {
  readonly total: number
  readonly completed: number
  readonly currentFile: string
}

// -- Atoms (scoped to active project) --

const makeFrameId = S.decodeSync(FrameId)

const storageRuntime = Atom.runtime(AppBlobStore)

export const importProgressAtom = Atom.make<ImportProgress>({ total: 0, completed: 0, currentFile: "" })

export const importFnAtom = storageRuntime.fn(
  Effect.fnUntraced(function* (files: FileList, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const framesRecord = (entry.root.focus("frames").syncGet() ?? {}) as Record<string, Frame>
    const startIndex = Object.keys(framesRecord).length
    const store = yield* BlobStore

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"))
    if (imageFiles.length === 0) return []

    const sorted = sortFramesByName(imageFiles)
    appRegistry.set(importProgressAtom, { total: sorted.length, completed: 0, currentFile: "" })

    const frames: Array<Frame> = []

    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i]
      appRegistry.set(importProgressAtom, { total: sorted.length, completed: i, currentFile: file.name })

      const [buffer, dims] = yield* Effect.promise(() =>
        Promise.all([readFileAsArrayBuffer(file), getImageDimensions(file)]),
      )

      const data = new Uint8Array(buffer)
      const contentHash = yield* store.put(data)
      const id = makeFrameId(crypto.randomUUID())
      const frame: Frame = {
        id,
        index: startIndex + i,
        contentHash: contentHash as Frame["contentHash"],
        width: dims.width,
        height: dims.height,
        paths: {},
      }
      entry.root.focus("frames").focus(id).syncSet(frame)
      frames.push(frame)
    }

    appRegistry.set(importProgressAtom, { total: sorted.length, completed: sorted.length, currentFile: "" })
    yield* Effect.promise(() => entry.persistence.flush())
    return frames
  }),
)
