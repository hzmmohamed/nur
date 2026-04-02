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

export interface YDocPersistence {
  readonly sync: () => Promise<void>
  readonly storeUpdate: (update: Uint8Array) => Promise<void>
  readonly flush: () => Promise<void>
  readonly destroy: () => void
}

export function createYDocPersistence(name: string, doc: Y.Doc): YDocPersistence {
  const dbPromise = openDb(name)
  let destroyed = false
  let updateCount = 0

  let pendingWrites = 0

  let flushScheduled = false

  const scheduleFlush = () => {
    if (flushScheduled) return
    flushScheduled = true
    setTimeout(() => {
      flushScheduled = false
      persistence.flush()
    }, 1000)
  }

  const updateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin === persistence || destroyed) return
    pendingWrites++
    console.debug(`[ydoc-persistence:${name}] update received, size=${update.byteLength}, pending=${pendingWrites}, origin=${origin}`)
    persistence.storeUpdate(update).then(() => {
      pendingWrites--
      console.debug(`[ydoc-persistence:${name}] update stored, pending=${pendingWrites}, total=${updateCount}`)
      scheduleFlush()
    }).catch((err) => {
      pendingWrites--
      console.error(`[ydoc-persistence:${name}] storeUpdate failed`, err)
    })
  }

  const persistence: YDocPersistence = {
    sync: async () => {
      const db = await dbPromise
      if (destroyed) return
      const tx = db.transaction(UPDATES_STORE, "readonly")
      const store = tx.objectStore(UPDATES_STORE)
      const updates = await idbGetAll(store)
      updateCount = updates.length
      console.debug(`[ydoc-persistence:${name}] sync: loaded ${updates.length} updates from IndexedDB`)

      // Store current doc state before applying updates (following y-indexeddb pattern)
      // This ensures Yjs can correctly merge updates relative to the known state vector
      const tx2 = db.transaction(UPDATES_STORE, "readwrite")
      const store2 = tx2.objectStore(UPDATES_STORE)
      await idbPut(store2, Y.encodeStateAsUpdate(doc))

      Y.transact(doc, () => {
        for (const update of updates) {
          Y.applyUpdate(doc, update)
        }
      }, persistence, false)

      doc.on("update", updateHandler)
      console.debug(`[ydoc-persistence:${name}] sync: applied ${updates.length} updates, handler attached`)
    },

    storeUpdate: async (update: Uint8Array) => {
      const db = await dbPromise
      if (destroyed) return
      const tx = db.transaction(UPDATES_STORE, "readwrite")
      const store = tx.objectStore(UPDATES_STORE)
      await idbPut(store, update)
      updateCount++

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
