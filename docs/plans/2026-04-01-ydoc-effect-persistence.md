# Replace y-indexeddb with Effect-based Y.Doc Persistence

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `y-indexeddb` (which silently drops writes when IDB isn't ready) with an Effect-native persistence layer that guarantees writes are awaitable and flushed before navigation.

**Architecture:** A `YDocPersistence` module in `@nur/core` that follows the same IDB protocol as y-indexeddb (append updates to an `updates` object store, compact when >500 entries) but exposes every operation as an `Effect`. The `createProjectDoc` function returns a `persistence` object with `sync()`, `flush()`, and `destroy()` as Effects. The project-doc-atoms layer in the editor app awaits `sync()` before exposing data, and the import pipeline awaits `flush()` after batch writes.

**Tech Stack:** `effect`, `yjs`, native `IndexedDB` API (same pattern as `@nur/object-store/blob-store.ts`)

---

## Root Cause

`y-indexeddb` has a race condition: the `_storeUpdate` handler (line 107-122) checks `if (this.db && origin !== this)` — if the IDB connection hasn't opened yet (`this.db` is null), updates are silently dropped. Frames written to Y.Doc before IDB is ready are never persisted. On reload, only the empty initial state loads.

Additionally, `y-indexeddb` provides no way to await a write completing — IDB transactions fire-and-forget, so navigating away mid-transaction loses data.

---

### Task 1: Create YDocPersistence module

**Files:**
- Create: `packages/core/src/ydoc-persistence.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Write the persistence module**

The module follows the same IDB schema as y-indexeddb for backwards compatibility (existing `nur-project-*` databases keep working):
- Object store `"updates"` with autoIncrement keys — each entry is a `Uint8Array` Y.Doc update
- Compact: when updates exceed 500, snapshot full state and delete old entries

```ts
// packages/core/src/ydoc-persistence.ts
import * as Y from "yjs"

const UPDATES_STORE = "updates"
const PREFERRED_TRIM_SIZE = 500

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(UPDATES_STORE)) {
        db.createObjectStore(UPDATES_STORE, { autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbGetAll(store: IDBObjectStore): Promise<Array<Uint8Array>> {
  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbPut(store: IDBObjectStore, value: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.add(value)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function idbClear(store: IDBObjectStore): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function idbCount(store: IDBObjectStore): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = store.count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export interface YDocPersistence {
  /** Load stored updates into doc. Resolves when IDB is synced. */
  readonly sync: () => Promise<void>
  /** Write a single update to IDB. Awaitable — resolves when IDB transaction commits. */
  readonly storeUpdate: (update: Uint8Array) => Promise<void>
  /** Force a full state snapshot to IDB and compact old updates. */
  readonly flush: () => Promise<void>
  /** Unsubscribe from doc updates and close IDB. */
  readonly destroy: () => void
}

export function createYDocPersistence(name: string, doc: Y.Doc): YDocPersistence {
  const dbPromise = openDb(name)
  let destroyed = false
  let updateCount = 0

  // Track the update handler so we can unsubscribe
  const updateHandler = (update: Uint8Array, origin: unknown) => {
    // Don't persist updates that came from persistence itself (avoid loops)
    if (origin === persistence || destroyed) return
    persistence.storeUpdate(update)
  }

  const persistence: YDocPersistence = {
    sync: async () => {
      const db = await dbPromise
      if (destroyed) return
      const tx = db.transaction(UPDATES_STORE, "readonly")
      const store = tx.objectStore(UPDATES_STORE)
      const updates = await idbGetAll(store)
      updateCount = updates.length

      // Apply stored updates to doc in a single transaction
      Y.transact(doc, () => {
        for (const update of updates) {
          Y.applyUpdate(doc, update)
        }
      }, persistence, false)

      // Now subscribe to future updates
      doc.on("update", updateHandler)
    },

    storeUpdate: async (update: Uint8Array) => {
      const db = await dbPromise
      if (destroyed) return
      const tx = db.transaction(UPDATES_STORE, "readwrite")
      const store = tx.objectStore(UPDATES_STORE)
      await idbPut(store, update)
      updateCount++

      // Auto-compact when updates pile up
      if (updateCount >= PREFERRED_TRIM_SIZE) {
        await persistence.flush()
      }
    },

    flush: async () => {
      const db = await dbPromise
      if (destroyed) return
      const snapshot = Y.encodeStateAsUpdate(doc)
      const tx = db.transaction(UPDATES_STORE, "readwrite")
      const store = tx.objectStore(UPDATES_STORE)
      await idbClear(store)
      await idbPut(store, snapshot)
      updateCount = 1
    },

    destroy: () => {
      destroyed = true
      doc.off("update", updateHandler)
      dbPromise.then((db) => db.close())
    },
  }

  return persistence
}
```

**Step 2: Export from core index**

Add to `packages/core/src/index.ts`:

```ts
export { createYDocPersistence, type YDocPersistence } from "./ydoc-persistence"
```

**Step 3: Verify typecheck**

Run: `cd packages/core && npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```
feat(core): add Effect-native Y.Doc IndexedDB persistence

Replaces y-indexeddb with awaitable IDB operations. Every write
is guaranteed to complete before the promise resolves. Compatible
with existing nur-project-* IndexedDB databases.
```

---

### Task 2: Wire createProjectDoc to use new persistence

**Files:**
- Modify: `packages/core/src/project-doc.ts`
- Modify: `packages/core/package.json` (remove `y-indexeddb` dependency)

**Step 1: Replace y-indexeddb with createYDocPersistence**

```ts
// packages/core/src/project-doc.ts
import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { createYDocPersistence, type YDocPersistence } from "./ydoc-persistence"
import { FrameSchema } from "./schemas/frame"
import type { ProjectId } from "./schemas/ids"

export const ProjectDocSchema = S.Struct({
  name: S.Trimmed.pipe(S.minLength(1), S.maxLength(200)),
  frames: S.Record({ key: S.String, value: FrameSchema }),
})

export type ProjectDoc = S.Schema.Type<typeof ProjectDocSchema>

export function createProjectDoc(projectId: ProjectId) {
  const { doc, root } = YDocument.make(ProjectDocSchema)
  const persistence = createYDocPersistence(`nur-project-${projectId}`, doc)
  return { doc, root, persistence }
}
```

**Step 2: Remove y-indexeddb from package.json**

Remove `"y-indexeddb": "^9.0.12"` from `packages/core/package.json` dependencies.

**Step 3: Update project-doc-atoms to use new persistence API**

The `project-doc-atoms.ts` `projectReadyAtom` currently listens for `persistence.once("synced")`. The new API uses `persistence.sync()` which returns a Promise. Update the atom:

In `apps/editor/src/lib/project-doc-atoms.ts`, change the `ProjectDocEntry` interface and `getOrCreateProjectDoc` to call `persistence.sync()` eagerly, and change `projectReadyAtom` to track the sync promise:

```ts
// In getOrCreateProjectDoc, after creating persistence:
const syncPromise = persistence.sync()

// Change ProjectDocEntry to include syncPromise:
interface ProjectDocEntry {
  readonly root: ...
  readonly doc: ...
  readonly persistence: YDocPersistence
  readonly awareness: ...
  readonly syncPromise: Promise<void>
}

// Change projectReadyAtom:
export const projectReadyAtom = Atom.family((projectId: string) =>
  Atom.make((get) => {
    const { syncPromise } = getOrCreateProjectDoc(projectId)
    let synced = false
    syncPromise.then(() => {
      synced = true
      get.setSelf(true)
    })
    return synced
  }),
)
```

**Step 4: Run existing tests**

Run: `cd packages/core && npx vitest run`
Expected: all tests pass (project-doc.test.ts doesn't test persistence, only Y.Doc in-memory behavior)

**Step 5: Verify editor typecheck**

Run: `npx tsc --noEmit -p apps/editor/tsconfig.json`
Expected: no errors

**Step 6: Commit**

```
refactor(core): replace y-indexeddb with YDocPersistence

The new persistence guarantees writes complete before resolving.
Removes y-indexeddb dependency. Compatible with existing IDB data.
```

---

### Task 3: Flush persistence after frame import

**Files:**
- Modify: `apps/editor/src/lib/project-doc-atoms.ts` (expose flush)
- Modify: `apps/editor/src/lib/import-atoms.ts` (await flush after import)

**Step 1: Export flushProjectDoc**

Add to `apps/editor/src/lib/project-doc-atoms.ts`:

```ts
/** Force flush Y.Doc state to IndexedDB */
export function flushProjectDoc(projectId: string): Promise<void> {
  return getOrCreateProjectDoc(projectId).persistence.flush()
}

/** Wait for persistence sync before writing */
export function waitForPersistence(projectId: string): Promise<void> {
  return getOrCreateProjectDoc(projectId).syncPromise
}
```

**Step 2: Await sync before writing, flush after import**

In `apps/editor/src/lib/import-atoms.ts`, add to the import Effect:

```ts
// At the top of the Effect, before any writes:
yield* Effect.promise(() => waitForPersistence(args.projectId))

// At the end, after all frames are written:
yield* Effect.promise(() => flushProjectDoc(args.projectId))
```

**Step 3: Verify typecheck**

Run: `npx tsc --noEmit -p apps/editor/tsconfig.json`
Expected: no errors

**Step 4: Commit**

```
fix(editor): await persistence sync before import, flush after

Guarantees IDB is ready before writing frames and forces a full
state snapshot after import completes. Fixes frames disappearing
on reload.
```

---

### Task 4: Remove y-indexeddb from editor and clean up

**Files:**
- Modify: `apps/editor/vite.config.ts` (remove y-indexeddb exclude)
- Modify: `apps/editor/package.json` (if y-indexeddb is listed)

**Step 1: Remove vite exclude**

In `apps/editor/vite.config.ts`, the `optimizeDeps.exclude` has `"y-indexeddb"`. Remove that entry.

**Step 2: Remove from editor package.json if present**

Check if `y-indexeddb` appears in `apps/editor/package.json` — if so, remove it.

**Step 3: Verify the editor still builds and typechecks**

Run: `npx tsc --noEmit -p apps/editor/tsconfig.json`
Expected: no errors

**Step 4: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: all tests pass

**Step 5: Commit**

```
chore: remove y-indexeddb from editor config

No longer needed — persistence is handled by YDocPersistence.
```

---

### Task 5: Add beforeunload flush

**Files:**
- Modify: `apps/editor/src/lib/project-doc-atoms.ts`

**Step 1: Add a global beforeunload handler**

The `getOrCreateProjectDoc` function already tracks all open project docs in `docCache`. Add a `beforeunload` handler that flushes all open docs:

```ts
// At module level, after docCache definition:
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    for (const entry of docCache.values()) {
      // Fire-and-forget — browser gives limited time
      entry.persistence.flush()
    }
  })
}
```

Note: `beforeunload` has limited time, so this is best-effort. The real fix was Task 3 (flush after import). This is defense-in-depth.

**Step 2: Commit**

```
fix(editor): flush all open Y.Doc persistence on beforeunload

Defense-in-depth: ensures pending IDB writes are flushed when
the user closes the tab.
```
