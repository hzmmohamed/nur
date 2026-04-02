import * as Y from "yjs"
import { Effect, Scope } from "effect"

const UPDATES_STORE = "updates"
const PREFERRED_TRIM_SIZE = 500
const FLUSH_DEBOUNCE_MS = 1000

// -- IndexedDB helpers --

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

// -- Service interface --

export interface YDocPersistence {
  readonly storeUpdate: (update: Uint8Array) => Effect.Effect<void>
  readonly flush: () => Effect.Effect<void>
}

// -- Service constructor --

export const makeYDocPersistence = (
  name: string,
  doc: Y.Doc,
): Effect.Effect<YDocPersistence, never, Scope.Scope> =>
  Effect.gen(function* () {
    // Acquire db — release closes it
    const db = yield* Effect.acquireRelease(
      Effect.promise(() => openDb(name)),
      (db) => Effect.sync(() => db.close()),
    )

    // Load and apply stored updates (hydrate)
    const tx = db.transaction(UPDATES_STORE, "readonly")
    const store = tx.objectStore(UPDATES_STORE)
    const updates = yield* Effect.promise(() => idbGetAll(store))

    console.debug(`[ydoc-persistence:${name}] sync: loaded ${updates.length} updates`)

    Y.transact(doc, () => {
      for (const update of updates) {
        Y.applyUpdate(doc, update)
      }
    }, "persistence", false)

    console.debug(`[ydoc-persistence:${name}] sync: applied ${updates.length} updates`)

    // Internal mutable state
    let updateCount = updates.length
    let flushTimeout: ReturnType<typeof setTimeout> | null = null

    // -- storeUpdate (called from update handler) --
    const storeUpdate = (update: Uint8Array): Effect.Effect<void> =>
      Effect.promise(async () => {
        const writeTx = db.transaction(UPDATES_STORE, "readwrite")
        const writeStore = writeTx.objectStore(UPDATES_STORE)
        await idbPut(writeStore, update)
        updateCount++

        if (updateCount >= PREFERRED_TRIM_SIZE) {
          await Effect.runPromise(flush())
        } else {
          // Debounced flush to ensure data survives page unload
          if (flushTimeout !== null) clearTimeout(flushTimeout)
          flushTimeout = setTimeout(() => {
            flushTimeout = null
            Effect.runPromise(flush())
          }, FLUSH_DEBOUNCE_MS)
        }
      })

    // -- flush (compress all updates into single snapshot) --
    const flush = (): Effect.Effect<void> =>
      Effect.promise(async () => {
        const snapshot = Y.encodeStateAsUpdate(doc)
        const flushTx = db.transaction(UPDATES_STORE, "readwrite")
        const flushStore = flushTx.objectStore(UPDATES_STORE)
        await idbClear(flushStore)
        await idbPut(flushStore, snapshot)
        updateCount = 1
        console.debug(`[ydoc-persistence:${name}] flushed, snapshot size=${snapshot.byteLength}`)
      })

    // -- Update handler (doc mutations → IndexedDB) --
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === "persistence") return
      console.debug(`[ydoc-persistence:${name}] update received, size=${update.byteLength}`)
      Effect.runPromise(storeUpdate(update)).catch((err) => {
        console.error(`[ydoc-persistence:${name}] storeUpdate failed`, err)
      })
    }

    // Attach update handler — release detaches it and cancels pending flush
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        doc.on("update", updateHandler)
        console.debug(`[ydoc-persistence:${name}] update handler attached`)
      }),
      () =>
        Effect.sync(() => {
          doc.off("update", updateHandler)
          if (flushTimeout !== null) clearTimeout(flushTimeout)
          console.debug(`[ydoc-persistence:${name}] update handler detached`)
        }),
    )

    return { storeUpdate, flush } satisfies YDocPersistence
  })
