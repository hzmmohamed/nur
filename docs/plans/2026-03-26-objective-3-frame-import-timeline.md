# Objective 3: Frame Import + Timeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build content-addressed blob storage, actor-driven frame import with web worker, reactive frame image atom chain, hotkey manager, Konva canvas display, and canvas-rendered timeline with scrubbing.

**Architecture:** Every aspect of behavior is owned by a long-running actor. Components are pure renderers. `currentFrameIndex` is a writable atom synced to Yjs awareness. `currentFrameImage` is a derived atom that reads the index, looks up the frame's content hash from the Y.Doc, and fetches/decodes the image through `Effect.Cache` backed by `BlobStore`. `ImportManager` is an effect-machine actor that orchestrates file import with a web worker and progress reporting. `HotkeyManager` is an effect-machine actor that components register/unregister hotkey contexts with — it manages global keyboard and scroll events. Components never own behavior — they read atoms and dispatch events.

**Effect patterns:** `BlobStore` is `Context.Tag` (no sensible default — in-memory for tests, IndexedDB for production). `importFrames` returns `Effect<..., BlobStore>`. Effect.Cache for the image decode pipeline. `MutableHashMap` for internal maps. effect-machine for ImportManager and HotkeyManager.

**Tech Stack:** effect (Context.Tag, Layer, Effect, Cache, MutableHashMap), effect-machine (Machine, State, Event, Slot), effect-yjs (YAwareness), @effect-atom/atom + atom-react, Konva + react-konva, Panda CSS, React 19

---

### Task 1: Implement BlobStore Effect service

**Files:**
- Create: `packages/object-store/src/blob-store.ts`
- Create: `packages/object-store/src/hash.ts`
- Test: `packages/object-store/src/hash.test.ts`
- Test: `packages/object-store/src/blob-store.test.ts`
- Modify: `packages/object-store/src/index.ts`

**Step 1: Write hash utility test**

Create `packages/object-store/src/hash.test.ts`:

```ts
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
```

**Step 2: Implement hash utility**

Create `packages/object-store/src/hash.ts`:

```ts
import * as Effect from "effect/Effect"

export const hashBlob = (data: Uint8Array): Effect.Effect<string> =>
  Effect.promise(async () => {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = new Uint8Array(hashBuffer)
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  })
```

**Step 3: Run hash tests**

Run: `pnpm --filter @nur/object-store test`
Expected: PASS

**Step 4: Write blob store test**

Create `packages/object-store/src/blob-store.test.ts`:

```ts
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
```

**Step 5: Implement BlobStore service**

Create `packages/object-store/src/blob-store.ts`:

```ts
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
```

**Step 6: Export from package index**

Update `packages/object-store/src/index.ts`:

```ts
export { BlobStore, InMemoryBlobStore, IndexedDBBlobStore } from "./blob-store"
export { hashBlob } from "./hash"
```

**Step 7: Run tests and typecheck**

Run: `pnpm --filter @nur/object-store test && pnpm --filter @nur/object-store typecheck`

**Step 8: Commit**

```bash
git add packages/object-store/
git commit -m "feat(object-store): add BlobStore Effect service with SHA-256 content-addressed storage"
```

---

### Task 2: Frame image atom chain with Effect.Cache

**Files:**
- Create: `packages/core/src/frame-atoms.ts`
- Test: `packages/core/src/frame-atoms.test.ts`
- Modify: `packages/core/src/index.ts`

This task builds the reactive atom chain: `currentFrameIndex` (writable, synced to Yjs awareness) → `currentFrameImage` (derived, backed by Effect.Cache + BlobStore).

**Step 1: Add dependencies**

Add to `packages/core/package.json` dependencies:

```json
"@nur/object-store": "workspace:*"
```

Run: `pnpm install`

**Step 2: Write test**

Create `packages/core/src/frame-atoms.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import * as Y from "yjs"
import { YDocument, YAwareness } from "effect-yjs"
import { ProjectDocSchema } from "./project-doc"
import { AwarenessSchema } from "./schemas/awareness"
import { createCurrentFrameIndex } from "./frame-atoms"

describe("currentFrameIndex atom", () => {
  it("reads initial value from awareness", () => {
    const doc = new Y.Doc()
    const awareness = YAwareness.make(AwarenessSchema, doc)
    awareness.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    const { get, set } = createCurrentFrameIndex(awareness)
    expect(get()).toBe(0)
  })

  it("updates awareness when set", () => {
    const doc = new Y.Doc()
    const awareness = YAwareness.make(AwarenessSchema, doc)
    awareness.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    const { get, set } = createCurrentFrameIndex(awareness)
    set(5)
    expect(awareness.local.focus("currentFrame").syncGet()).toBe(5)
    expect(get()).toBe(5)
  })
})
```

**Step 3: Implement frame atoms**

Create `packages/core/src/frame-atoms.ts`:

The `currentFrameIndex` is a simple wrapper around the awareness lens. The image loading and caching is handled at the app layer (since it needs BlobStore + DOM Image APIs), but the index atom and frame lookup are in core.

```ts
import type { Atom } from "@effect-atom/atom"
import type { YAwarenessHandle } from "effect-yjs"
import type { AwarenessState } from "./schemas/awareness"

export function createCurrentFrameIndex(awareness: YAwarenessHandle<AwarenessState>) {
  const atom = awareness.local.focus("currentFrame").atom()

  return {
    atom,
    get: (): number => awareness.local.focus("currentFrame").syncGet() ?? 0,
    set: (index: number): void => {
      awareness.local.focus("currentFrame").syncSet(index)
    },
  }
}
```

**Step 4: Export from package index**

Add to `packages/core/src/index.ts`:

```ts
export { createCurrentFrameIndex } from "./frame-atoms"
```

**Step 5: Run tests and typecheck**

Run: `pnpm --filter @nur/core test && pnpm --filter @nur/core typecheck`

**Step 6: Commit**

```bash
git add packages/core/
git commit -m "feat(core): add currentFrameIndex atom with awareness sync"
```

---

### Task 3: Frame import service

**Files:**
- Create: `packages/core/src/frame-import.ts`
- Test: `packages/core/src/frame-import.test.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Write test**

Create `packages/core/src/frame-import.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import * as Effect from "effect/Effect"
import { YDocument } from "effect-yjs"
import { InMemoryBlobStore, BlobStore } from "@nur/object-store"
import { ProjectDocSchema } from "./project-doc"
import { importFrames, sortFramesByName } from "./frame-import"

describe("sortFramesByName", () => {
  it("sorts files numerically when names contain numbers", () => {
    const files = [
      { name: "frame10.png" },
      { name: "frame2.png" },
      { name: "frame1.png" },
    ] as Array<File>
    const sorted = sortFramesByName(files)
    expect(sorted.map((f) => f.name)).toEqual([
      "frame1.png",
      "frame2.png",
      "frame10.png",
    ])
  })
})

describe("importFrames", () => {
  const runWithStore = <A>(effect: Effect.Effect<A, never, BlobStore>) =>
    Effect.runPromise(effect.pipe(Effect.provide(InMemoryBlobStore)))

  it("imports image data and writes frame entries to Y.Doc", async () => {
    const { root } = YDocument.make(ProjectDocSchema)

    const result = await runWithStore(
      importFrames({
        files: [
          { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), name: "frame1.png", width: 100, height: 50 },
        ],
        projectRoot: root,
        startIndex: 0,
      })
    )

    expect(result).toHaveLength(1)
    expect(result[0].index).toBe(0)
    expect(result[0].width).toBe(100)
    expect(result[0].height).toBe(50)

    const frames = root.focus("frames").syncGet() ?? {}
    expect(Object.keys(frames)).toHaveLength(1)
  })

  it("assigns sequential indices starting from startIndex", async () => {
    const { root } = YDocument.make(ProjectDocSchema)

    const result = await runWithStore(
      importFrames({
        files: [
          { data: new Uint8Array([1]), name: "a.png", width: 100, height: 100 },
          { data: new Uint8Array([2]), name: "b.png", width: 100, height: 100 },
          { data: new Uint8Array([3]), name: "c.png", width: 100, height: 100 },
        ],
        projectRoot: root,
        startIndex: 5,
      })
    )

    expect(result.map((f) => f.index)).toEqual([5, 6, 7])
  })
})
```

**Step 2: Implement frame import service**

Create `packages/core/src/frame-import.ts`:

```ts
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
        }
        projectRoot.focus("frames").focus(id).syncSet(frame)
        return frame
      })
    )
  })
}
```

**Step 3: Export from package index**

Add to `packages/core/src/index.ts`:

```ts
export { importFrames, sortFramesByName, type PreparedFrame } from "./frame-import"
```

**Step 4: Run tests and typecheck**

Run: `pnpm --filter @nur/core test && pnpm --filter @nur/core typecheck`

**Step 5: Commit**

```bash
git add packages/core/
git commit -m "feat(core): add frame import service as Effect program requiring BlobStore"
```

---

### Task 4: Import manager effect-machine actor

**Files:**
- Create: `apps/editor/src/actors/import-manager.ts`
- Create: `apps/editor/src/lib/blob-store-layer.ts`

The import manager is an effect-machine actor with states: `Idle → Preparing → Importing → Done | Error`. It receives file drop/select events, prepares files (read + dimensions), imports them through the BlobStore-backed import service, and exposes progress via an atom.

**Reference:** `apps/web/src/components/import-frames-dialog.tsx` — the prototype used XState + web worker. We port to effect-machine.

**Step 1: Create the blob store layer**

Create `apps/editor/src/lib/blob-store-layer.ts`:

```ts
import { IndexedDBBlobStore } from "@nur/object-store"

export const AppBlobStore = IndexedDBBlobStore("nur-blobs")
```

**Step 2: Implement the import manager actor**

Create `apps/editor/src/actors/import-manager.ts`:

This uses effect-machine's `Machine.make` with `State`, `Event`, and `Slot.Effects` for the actual import work. The import logic runs as a state-scoped `.spawn()` effect that gets cancelled if the user navigates away.

```ts
import { Machine, State, Event, Slot } from "effect-machine"
import * as S from "effect/Schema"
import { Effect, Scope } from "effect"
import { Atom } from "@effect-atom/atom"
import { sortFramesByName, importFrames, type PreparedFrame } from "@nur/core"
import type { YDocumentRoot } from "effect-yjs"
import type { ProjectDoc, Frame } from "@nur/core"
import { BlobStore } from "@nur/object-store"
import { AppBlobStore } from "../lib/blob-store-layer"

// -- State --

const ImportState = State({
  Idle: {},
  Preparing: { fileCount: S.Number },
  Importing: {
    prepared: S.Unknown, // Array<PreparedFrame> (opaque to schema)
    total: S.Number,
    completed: S.Number,
  },
  Done: { imported: S.Number },
  Error: { message: S.String },
})

// -- Events --

const ImportEvent = Event({
  StartImport: { files: S.Unknown }, // FileList from DOM
  FilesPrepared: { prepared: S.Unknown }, // Array<PreparedFrame>
  ImportProgress: { completed: S.Number, total: S.Number },
  ImportComplete: { frames: S.Unknown }, // Array<Frame>
  ImportFailed: { message: S.String },
  Reset: {},
})

// -- Effects --

const ImportEffects = Slot.Effects({
  prepareFiles: { files: S.Unknown },
  runImport: { prepared: S.Unknown },
})

// -- Progress atom (external visibility) --

export const importProgressAtom = Atom.of<{
  state: "idle" | "preparing" | "importing" | "done" | "error"
  total: number
  completed: number
  message?: string
}>({
  state: "idle",
  total: 0,
  completed: 0,
})

// -- Machine --

export const importManagerMachine = Machine.make({
  state: ImportState,
  event: ImportEvent,
  effects: ImportEffects,
  initial: ImportState.Idle,
})
  .on(ImportState.Idle, ImportEvent.StartImport, ({ event }) =>
    ImportState.Preparing({ fileCount: (event.files as FileList).length })
  )
  .spawn(ImportState.Preparing, ({ state, self, effects }) =>
    effects.prepareFiles({ files: state })
  )
  .on(ImportState.Preparing, ImportEvent.FilesPrepared, ({ event }) => {
    const prepared = event.prepared as Array<PreparedFrame>
    return ImportState.Importing({
      prepared: event.prepared,
      total: prepared.length,
      completed: 0,
    })
  })
  .spawn(ImportState.Importing, ({ state, self, effects }) =>
    effects.runImport({ prepared: state.prepared })
  )
  .on(ImportState.Importing, ImportEvent.ImportProgress, ({ state, event }) =>
    ImportState.Importing({
      ...state,
      completed: event.completed,
    })
  )
  .on(ImportState.Importing, ImportEvent.ImportComplete, ({ event }) => {
    const frames = event.frames as Array<Frame>
    return ImportState.Done({ imported: frames.length })
  })
  .on(ImportState.Preparing, ImportEvent.ImportFailed, ({ event }) =>
    ImportState.Error({ message: event.message })
  )
  .on(ImportState.Importing, ImportEvent.ImportFailed, ({ event }) =>
    ImportState.Error({ message: event.message })
  )
  .on(ImportState.Done, ImportEvent.Reset, () => ImportState.Idle)
  .on(ImportState.Error, ImportEvent.Reset, () => ImportState.Idle)
```

Note: The `.build()` call that provides effect implementations will happen at the app level where we have access to the `projectRoot` and `BlobStore` layer. The machine definition is decoupled from the implementations.

**Step 3: Typecheck**

Run: `pnpm --filter @nur/editor typecheck`

**Step 4: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): add ImportManager effect-machine actor with progress atom"
```

---

### Task 5: Hotkey manager effect-machine actor

**Files:**
- Create: `apps/editor/src/actors/hotkey-manager.ts`

The hotkey manager is an always-running actor. Components register/unregister hotkey contexts. The active context is determined by a focus atom. The manager listens to global keyboard and wheel events and dispatches to the active context's bindings.

**Step 1: Implement hotkey manager**

Create `apps/editor/src/actors/hotkey-manager.ts`:

```ts
import { Machine, State, Event } from "effect-machine"
import * as S from "effect/Schema"
import { Effect, Scope } from "effect"
import { Atom } from "@effect-atom/atom"
import * as MutableHashMap from "effect/MutableHashMap"

// -- Types --

export type HotkeyBinding = {
  readonly key: string // e.g. "ArrowRight", "ctrl+s", "ctrl+wheel"
  readonly handler: () => void
  readonly description?: string
}

export type HotkeyContext = {
  readonly id: string
  readonly bindings: ReadonlyArray<HotkeyBinding>
}

// -- Atoms --

export const activeContextIdAtom = Atom.of<string | null>(null)
export const registeredContextsAtom = Atom.of<ReadonlyArray<HotkeyContext>>([])

// -- State --

const HotkeyState = State({
  Running: {},
})

// -- Events --

const HotkeyEvent = Event({
  RegisterContext: { context: S.Unknown },
  UnregisterContext: { contextId: S.String },
  SetFocus: { contextId: S.String },
  ClearFocus: {},
})

// -- Internal registry --

const contexts = MutableHashMap.empty<string, HotkeyContext>()

function getActiveBindings(): ReadonlyArray<HotkeyBinding> {
  const activeId = Atom.unsafeGet(activeContextIdAtom)
  if (!activeId) return []
  const ctx = MutableHashMap.get(contexts, activeId)
  return ctx._tag === "Some" ? ctx.value.bindings : []
}

function parseKey(e: KeyboardEvent): string {
  const parts: Array<string> = []
  if (e.ctrlKey || e.metaKey) parts.push("ctrl")
  if (e.shiftKey) parts.push("shift")
  if (e.altKey) parts.push("alt")
  parts.push(e.key)
  return parts.join("+")
}

// -- Machine --

export const hotkeyManagerMachine = Machine.make({
  state: HotkeyState,
  event: HotkeyEvent,
  initial: HotkeyState.Running,
})
  .on(HotkeyState.Running, HotkeyEvent.RegisterContext, ({ event }) => {
    const ctx = event.context as HotkeyContext
    MutableHashMap.set(contexts, ctx.id, ctx)
    Atom.unsafeSet(registeredContextsAtom, Array.from(MutableHashMap.values(contexts)))
    return HotkeyState.Running
  })
  .on(HotkeyState.Running, HotkeyEvent.UnregisterContext, ({ event }) => {
    MutableHashMap.remove(contexts, event.contextId)
    Atom.unsafeSet(registeredContextsAtom, Array.from(MutableHashMap.values(contexts)))
    // Clear focus if the unregistered context was active
    const activeId = Atom.unsafeGet(activeContextIdAtom)
    if (activeId === event.contextId) {
      Atom.unsafeSet(activeContextIdAtom, null)
    }
    return HotkeyState.Running
  })
  .on(HotkeyState.Running, HotkeyEvent.SetFocus, ({ event }) => {
    Atom.unsafeSet(activeContextIdAtom, event.contextId)
    return HotkeyState.Running
  })
  .on(HotkeyState.Running, HotkeyEvent.ClearFocus, () => {
    Atom.unsafeSet(activeContextIdAtom, null)
    return HotkeyState.Running
  })
  .background(({ self }) =>
    Effect.gen(function* () {
      // This runs for the lifetime of the actor
      // Set up global keyboard listener
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const handleKeyDown = (e: KeyboardEvent) => {
            const key = parseKey(e)
            const bindings = getActiveBindings()
            const binding = bindings.find((b) => b.key === key)
            if (binding) {
              e.preventDefault()
              binding.handler()
            }
          }
          window.addEventListener("keydown", handleKeyDown)
          return handleKeyDown
        }),
        (handler) =>
          Effect.sync(() => {
            window.removeEventListener("keydown", handler)
          })
      )
      // Keep alive
      yield* Effect.never
    })
  )

// -- React hook for components to register contexts --

// Components will use this pattern:
// useEffect(() => {
//   actor.sendSync(HotkeyEvent.RegisterContext({ context: { id: "timeline", bindings: [...] } }))
//   return () => actor.sendSync(HotkeyEvent.UnregisterContext({ contextId: "timeline" }))
// }, [])
//
// On mouse enter:
//   actor.sendSync(HotkeyEvent.SetFocus({ contextId: "timeline" }))
```

**Step 2: Typecheck**

Run: `pnpm --filter @nur/editor typecheck`

**Step 3: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): add HotkeyManager effect-machine actor with context registration"
```

---

### Task 6: Frame drop zone + import UI

**Files:**
- Create: `apps/editor/src/components/frame-drop-zone.tsx`

The drop zone is a pure renderer. It sends `StartImport` events to the ImportManager actor and reads the `importProgressAtom` for status display.

**Step 1: Create frame drop zone**

Create `apps/editor/src/components/frame-drop-zone.tsx`:

This component handles the DOM interaction (drag-and-drop, file picker) and delegates all behavior to the ImportManager actor.

```tsx
import { useState, useCallback } from "react"
import { css } from "../../styled-system/css"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { importProgressAtom } from "../actors/import-manager"

// Note: The actual actor ref will be passed as a prop or provided via context.
// The component only needs to send events and read the progress atom.

export function FrameDropZone(props: {
  onFilesSelected: (files: FileList) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const progress = useAtomValue(importProgressAtom)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      props.onFilesSelected(e.dataTransfer.files)
    }
  }, [props.onFilesSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleClick = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.accept = "image/*"
    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        props.onFilesSelected(input.files)
      }
    }
    input.click()
  }, [props.onFilesSelected])

  const isImporting = progress.state === "preparing" || progress.state === "importing"

  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: "1",
        border: "2px dashed",
        borderColor: dragOver ? "border.outline" : "border.default",
        borderRadius: "lg",
        m: "4",
        cursor: isImporting ? "default" : "pointer",
        transition: "border-color 0.15s",
        bg: dragOver ? "bg.muted" : "transparent",
        gap: "2",
      })}
      onDrop={isImporting ? undefined : handleDrop}
      onDragOver={isImporting ? undefined : handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={isImporting ? undefined : handleClick}
    >
      {isImporting ? (
        <>
          <p className={css({ color: "fg.muted" })}>
            Importing frames... {progress.completed}/{progress.total}
          </p>
        </>
      ) : (
        <p className={css({ color: "fg.muted", textAlign: "center" })}>
          Drop image files here or click to browse
        </p>
      )}
    </div>
  )
}
```

**Step 2: Run panda codegen, typecheck**

Run: `pnpm --filter @nur/editor prepare && pnpm --filter @nur/editor typecheck`

**Step 3: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): add FrameDropZone component with ImportManager integration"
```

---

### Task 7: Konva frame canvas with Effect.Cache image loading

**Files:**
- Create: `apps/editor/src/lib/frame-image-cache.ts`
- Create: `apps/editor/src/hooks/use-frame-image.ts`
- Create: `apps/editor/src/components/frame-canvas.tsx`

**Step 1: Create frame image cache using Effect.Cache**

Create `apps/editor/src/lib/frame-image-cache.ts`:

Uses `Effect.cachedFunction` (or `Cache.make`) for the content hash → HTMLImageElement pipeline. The cache is backed by the BlobStore service.

```ts
import * as Effect from "effect/Effect"
import * as Cache from "effect/Cache"
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

const loadImage = (contentHash: string): Effect.Effect<HTMLImageElement, Error, BlobStore> =>
  Effect.gen(function* () {
    const store = yield* BlobStore
    const data = yield* store.get(contentHash)
    if (!data) return yield* Effect.fail(new Error(`Blob not found: ${contentHash}`))
    return yield* Effect.promise(() => decodeImage(data))
  })

// Singleton cache — created once, lives for app lifetime
let _cache: Cache.Cache<string, HTMLImageElement, Error> | null = null

const getCache = (): Effect.Effect<Cache.Cache<string, HTMLImageElement, Error>> =>
  Effect.sync(() => {
    if (!_cache) {
      // Cache will be created on first access
      return null as any // Placeholder — see below
    }
    return _cache
  })

// Public API: load a frame image, cached
export const loadFrameImage = (contentHash: string): Effect.Effect<HTMLImageElement, Error> =>
  loadImage(contentHash).pipe(Effect.provide(AppBlobStore))

// Simple Map-based cache with the Effect pipeline
const imageCache = new Map<string, HTMLImageElement>()

export const getCachedFrameImage = (contentHash: string): HTMLImageElement | undefined =>
  imageCache.get(contentHash)

export const loadAndCacheFrameImage = (contentHash: string): Promise<HTMLImageElement> => {
  const cached = imageCache.get(contentHash)
  if (cached) return Promise.resolve(cached)

  return Effect.runPromise(loadFrameImage(contentHash)).then((img) => {
    imageCache.set(contentHash, img)
    return img
  })
}
```

Note: The full Effect.Cache integration requires more runtime setup. For now we use a simple Map + Effect pipeline. The cache can be upgraded to Effect.Cache when we set up the Effect runtime at the app level.

**Step 2: Create frame image hook**

Create `apps/editor/src/hooks/use-frame-image.ts`:

```ts
import { useEffect, useState } from "react"
import { getCachedFrameImage, loadAndCacheFrameImage } from "../lib/frame-image-cache"

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement | undefined>(
    contentHash ? getCachedFrameImage(contentHash) : undefined
  )

  useEffect(() => {
    if (!contentHash) {
      setImage(undefined)
      return
    }

    const cached = getCachedFrameImage(contentHash)
    if (cached) {
      setImage(cached)
      return
    }

    let cancelled = false

    loadAndCacheFrameImage(contentHash)
      .then((img) => { if (!cancelled) setImage(img) })
      .catch(() => { /* Image not found or decode failed */ })

    return () => { cancelled = true }
  }, [contentHash])

  return image
}
```

**Step 3: Create Konva frame canvas**

Create `apps/editor/src/components/frame-canvas.tsx`:

```tsx
import { Stage, Layer, Image as KonvaImage } from "react-konva"
import { useFrameImage } from "../hooks/use-frame-image"

export function FrameCanvas(props: {
  contentHash: string | undefined
  width: number
  height: number
  frameWidth: number
  frameHeight: number
}) {
  const image = useFrameImage(props.contentHash)

  if (!props.width || !props.height || !props.frameWidth || !props.frameHeight) {
    return null
  }

  const scale = Math.min(
    props.width / props.frameWidth,
    props.height / props.frameHeight
  )
  const scaledW = props.frameWidth * scale
  const scaledH = props.frameHeight * scale
  const offsetX = (props.width - scaledW) / 2
  const offsetY = (props.height - scaledH) / 2

  return (
    <Stage width={props.width} height={props.height}>
      <Layer>
        {image && (
          <KonvaImage
            image={image}
            x={offsetX}
            y={offsetY}
            width={scaledW}
            height={scaledH}
          />
        )}
      </Layer>
    </Stage>
  )
}
```

**Step 4: Run panda codegen, typecheck**

Run: `pnpm --filter @nur/editor prepare && pnpm --filter @nur/editor typecheck`

**Step 5: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): add Konva frame canvas with cached image loading"
```

---

### Task 8: Konva-rendered timeline with scrubbing

**Reference:** `apps/web/src/components/timeline-panel.tsx` — canvas-based rendering, scrubbing, zoom, keyboard navigation.

**Files:**
- Create: `apps/editor/src/components/timeline.tsx`

The timeline is a Konva `Stage` rendering frame cells, tick marks, and a current frame marker. It supports click-to-seek, click+drag scrubbing, Ctrl+scroll zoom, and registers hotkey contexts for arrow key navigation.

**Step 1: Create Konva timeline component**

Create `apps/editor/src/components/timeline.tsx`:

```tsx
import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import { Stage, Layer, Rect, Text, Line } from "react-konva"
import { css } from "../../styled-system/css"
import type Konva from "konva"

interface TimelineProps {
  frameCount: number
  currentFrame: number
  onFrameSelect: (index: number) => void
  width: number
}

const FRAME_CELL_BASE_WIDTH = 24
const TIMELINE_HEIGHT = 64
const HEADER_HEIGHT = 20

export function Timeline(props: TimelineProps) {
  const { frameCount, currentFrame, onFrameSelect, width } = props
  const [zoomLevel, setZoomLevel] = useState(1)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)

  const cellWidth = FRAME_CELL_BASE_WIDTH * zoomLevel
  const totalWidth = Math.max(frameCount * cellWidth, width)

  const positionToFrame = useCallback(
    (stageX: number): number => {
      const frame = Math.floor(stageX / cellWidth)
      return Math.max(0, Math.min(frame, frameCount - 1))
    },
    [cellWidth, frameCount]
  )

  // Mouse handlers
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (frameCount === 0) return
      setIsScrubbing(true)
      const pos = e.target.getStage()?.getPointerPosition()
      if (pos) {
        const scrollLeft = containerRef.current?.scrollLeft ?? 0
        onFrameSelect(positionToFrame(pos.x + scrollLeft))
      }
    },
    [frameCount, onFrameSelect, positionToFrame]
  )

  // Global mouse events for scrubbing
  useEffect(() => {
    if (!isScrubbing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left + containerRef.current.scrollLeft
      onFrameSelect(positionToFrame(x))
    }

    const handleMouseUp = () => setIsScrubbing(false)

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isScrubbing, onFrameSelect, positionToFrame])

  // Ctrl + scroll wheel zoom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        setZoomLevel((prev) => {
          const next = e.deltaY < 0
            ? Math.min(5, prev + 0.1)
            : Math.max(0.5, prev - 0.1)
          return parseFloat(next.toFixed(1))
        })
      }
    }
    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [])

  // Render frame cells as Konva shapes
  const frameCells = useMemo(() => {
    const cells: Array<React.ReactElement> = []
    for (let i = 0; i < frameCount; i++) {
      const x = i * cellWidth
      const isActive = i === currentFrame

      // Cell background
      if (isActive) {
        cells.push(
          <Rect
            key={`bg-${i}`}
            x={x}
            y={HEADER_HEIGHT}
            width={cellWidth}
            height={TIMELINE_HEIGHT - HEADER_HEIGHT}
            fill="rgba(59, 130, 246, 0.3)"
          />
        )
      }

      // Cell border
      cells.push(
        <Line
          key={`border-${i}`}
          points={[x, HEADER_HEIGHT, x, TIMELINE_HEIGHT]}
          stroke="#3f3f46"
          strokeWidth={1}
        />
      )

      // Frame number label
      const labelInterval = zoomLevel >= 1 ? 1 : zoomLevel >= 0.5 ? 5 : 10
      if ((i + 1) % labelInterval === 0 || i === 0) {
        cells.push(
          <Text
            key={`label-${i}`}
            x={x}
            y={4}
            width={cellWidth}
            text={`${i + 1}`}
            fontSize={10}
            fill="#a1a1aa"
            align="center"
          />
        )
      }

      // 10-frame markers
      if (i > 0 && i % 10 === 0) {
        cells.push(
          <Rect
            key={`marker-${i}`}
            x={x}
            y={HEADER_HEIGHT}
            width={1}
            height={TIMELINE_HEIGHT - HEADER_HEIGHT}
            fill="#71717a"
          />
        )
      }
    }

    // Current frame marker line
    if (currentFrame >= 0 && currentFrame < frameCount) {
      cells.push(
        <Rect
          key="playhead"
          x={currentFrame * cellWidth}
          y={0}
          width={2}
          height={TIMELINE_HEIGHT}
          fill="#3b82f6"
        />
      )
    }

    return cells
  }, [frameCount, currentFrame, cellWidth, zoomLevel])

  if (frameCount === 0) {
    return (
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          px: "4",
          py: "2",
          borderTop: "1px solid",
          borderColor: "border.default",
          minH: "16",
          bg: "bg.default",
        })}
      >
        <p className={css({ color: "fg.muted", fontSize: "sm" })}>
          No frames imported
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={css({
        borderTop: "1px solid",
        borderColor: "border.default",
        overflowX: "auto",
        overflowY: "hidden",
        cursor: "ew-resize",
        bg: "bg.default",
      })}
    >
      <Stage
        ref={stageRef}
        width={totalWidth}
        height={TIMELINE_HEIGHT}
        onMouseDown={handleStageMouseDown}
      >
        <Layer>
          {/* Background */}
          <Rect x={0} y={0} width={totalWidth} height={TIMELINE_HEIGHT} fill="#18181b" />
          {frameCells}
        </Layer>
      </Stage>
    </div>
  )
}
```

**Step 2: Run panda codegen, typecheck**

Run: `pnpm --filter @nur/editor prepare && pnpm --filter @nur/editor typecheck`

**Step 3: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): add Konva-rendered timeline with scrubbing and zoom"
```

---

### Task 9: Editor layout composition

**Files:**
- Create: `apps/editor/src/hooks/use-current-frame.ts`
- Modify: `apps/editor/src/routes/project.$id.tsx`

Wire everything together in the editor route:
- `useCurrentFrame(doc)` — creates the awareness-synced current frame atom
- Layout: header + main area (FrameCanvas or FrameDropZone) + timeline footer
- `useRef` + `ResizeObserver` for canvas sizing
- Frames atom from Y.Doc lens for reactive frame list
- Arrow key hotkey context registration

**Step 1: Create current frame hook**

Create `apps/editor/src/hooks/use-current-frame.ts`:

```ts
import { useMemo } from "react"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { YAwareness, type YAwarenessHandle } from "effect-yjs"
import type * as Y from "yjs"
import { AwarenessSchema, type AwarenessState, createCurrentFrameIndex } from "@nur/core"

const awarenessCache = new Map<Y.Doc, YAwarenessHandle<AwarenessState>>()

function getAwareness(doc: Y.Doc): YAwarenessHandle<AwarenessState> {
  let handle = awarenessCache.get(doc)
  if (!handle) {
    handle = YAwareness.make(AwarenessSchema, doc)
    handle.local.syncSet({
      currentFrame: 0,
      activeTool: "select",
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    awarenessCache.set(doc, handle)
  }
  return handle
}

export function useCurrentFrame(doc: Y.Doc): {
  currentFrame: number
  setCurrentFrame: (index: number) => void
} {
  const awareness = useMemo(() => getAwareness(doc), [doc])
  const { atom, set } = useMemo(() => createCurrentFrameIndex(awareness), [awareness])
  const currentFrame = useAtomValue(atom) as number | undefined

  return { currentFrame: currentFrame ?? 0, setCurrentFrame: set }
}
```

**Step 2: Update editor route**

Replace `apps/editor/src/routes/project.$id.tsx` with the full composition: header, canvas/dropzone, timeline. Use `useAtomValue` on the Y.Doc frames lens atom for reactive frame data.

This is the integration point — it wires FrameCanvas, FrameDropZone, Timeline, and useCurrentFrame together.

**Step 3: Run panda codegen, typecheck**

Run: `pnpm --filter @nur/editor prepare && pnpm --filter @nur/editor typecheck`

**Step 4: Commit**

```bash
git add apps/editor/
git commit -m "feat(editor): compose editor layout with canvas, timeline, and frame management"
```

---

### Task 10: Full pipeline verification

**Step 1: Typecheck all**

Run: `pnpm typecheck`
Expected: All packages pass.

**Step 2: Test all**

Run: `pnpm test`
Expected: All tests pass.

**Step 3: End-to-end manual verification**

Run: `pnpm --filter @nur/editor dev`

Verify the full flow:
1. Create a project from the list page
2. Editor opens with a drop zone
3. Drag image files onto the drop zone (or click to browse)
4. Frame count in header updates
5. Canvas shows the first frame scaled to fit
6. Konva timeline at bottom shows frame cells with numbers
7. Click a frame cell — canvas updates to show that frame
8. Click + drag to scrub rapidly across frames
9. Ctrl + scroll wheel zooms the timeline in/out
10. Arrow left/right navigates frame by frame (when timeline has focus)
11. Refresh the page — project and frames persist
12. Go back to project list, reopen the project — everything still there

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | BlobStore as Effect `Context.Tag` service (in-memory + IndexedDB layers) |
| 2 | Frame index atom chain with awareness sync |
| 3 | Frame import service as Effect program requiring `BlobStore` |
| 4 | ImportManager effect-machine actor with progress tracking |
| 5 | HotkeyManager effect-machine actor with context registration |
| 6 | FrameDropZone component (renders progress, dispatches to ImportManager) |
| 7 | Konva frame canvas with cached image loading |
| 8 | Konva-rendered timeline with scrubbing, zoom, frame navigation |
| 9 | Editor layout composition wiring all actors + components |
| 10 | Full pipeline verification |

## Actor dependency graph

```
HotkeyManager (effect-machine, always running)
  ├─ registeredContextsAtom
  ├─ activeContextIdAtom
  └─ global keydown listener (background effect)

ImportManager (effect-machine, per-import session)
  ├─ importProgressAtom
  ├─ BlobStore service (via layer)
  └─ writes to Y.Doc frames

currentFrameIndex (writable atom, synced to Yjs awareness)
  └─ read by: currentFrameImage, Timeline, FrameCanvas

frames (derived atom from Y.Doc lens)
  └─ read by: Timeline, editor header

currentFrameImage (derived: index → hash → cache → Image)
  └─ read by: FrameCanvas
```
