import { createMachine, assign, fromCallback, fromPromise } from "xstate";
import { openDB, type IDBPDatabase } from "idb";
import { LRUCache } from "lru-cache";

// Define the database and store names
const DB_NAME = "file-storage-db";
const STORE_NAME = "files";

// Type for the cached item
// type CachedFrame = ImageBitmap | null;

// class LRUCache {
//   private cache: Map<string, CachedFrame>;
//   private capacity: number;

//   constructor(capacity: number) {
//     this.capacity = capacity;
//     this.cache = new Map<string, CachedFrame>();
//   }

//   get(key: string): CachedFrame | -1 {
//     if (!this.cache.has(key)) {
//       return -1;
//     }
//     const value = this.cache.get(key) as CachedFrame;
//     this.cache.delete(key);
//     this.cache.set(key, value);
//     return value;
//   }

//   put(key: string, value: CachedFrame): void {
//     if (this.cache.has(key)) {
//       this.cache.delete(key);
//     } else if (this.cache.size >= this.capacity) {
//       const lruKey = this.cache.keys().next().value || "";
//       if (this.cache.get(lruKey) instanceof ImageBitmap) {
//         (this.cache.get(lruKey) as ImageBitmap).close();
//       }
//       this.cache.delete(lruKey);
//     }
//     this.cache.set(key, value);
//   }
// }

// 1. Define the machine's context
type FrameFetcherContext = {
  cache: LRUCache<string, ImageBitmap>;
  db: IDBPDatabase | null;
  frameIndex: number | null;
  sceneId: string;
  data: ImageBitmap | null;
  error: Error | null;
};

// 2. Define the machine's events
type FrameFetcherEvent =
  | { type: "FETCH_FRAME"; key: number }
  | { type: "RESOLVE"; data: ImageBitmap }
  | { type: "REJECT"; error: Error };

// 3. Mock async functions
async function getFrameFromIDB(
  db: IDBPDatabase,
  key: string
): Promise<ImageBitmap> {
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const frame = await store.get(key);
  await tx.done;
  if (!frame) throw new Error(`Frame with key ${key} not found in IndexedDB.`);
  return frame;
}

export const frameFetcherMachine = createMachine(
  {
    id: "frameFetcher",
    types: {
      context: {} as FrameFetcherContext,
      events: {} as FrameFetcherEvent,
      input: {} as {
        sceneId: string;
      },
    },
    initial: "idle",
    context: ({ input: { sceneId } }) => ({
      cache: new LRUCache<string, ImageBitmap>({
        max: 100, // Cache a maximum of 100 users
        ttl: 1000 * 60 * 5, // Cache entries expire after 5 minutes
        onInsert: (v, k, reason) => console.log("Inserted frame", v, k, reason),
      }),
      db: null,
      frameIndex: null,
      data: null,
      error: null,
      sceneId,
    }),
    states: {
      setup: {
        invoke: {
          src: fromPromise(() =>
            openDB(DB_NAME, 1, {
              upgrade(db) {
                db.createObjectStore(STORE_NAME);
              },
            })
          ),
          onDone: {
            target: "idle",
            actions: assign({
              db: ({ event: { output } }) => output,
            }),
          },
          onError: {
            target: "error",
          },
        },
      },
      idle: {
        on: {
          FETCH_FRAME: {
            target: "fetching",
            actions: ["setframeIndex"],
          },
        },
      },
      fetching: {
        on: {
          FETCH_FRAME: {
            actions: "setframeIndex",
          },
          RESOLVE: {
            target: "success",
            actions: [
              () => console.log("resolved"),
              assign({
                data: ({ event }) => event.data,
              }),
            ],
          },
          REJECT: {
            target: "error_fatal",
            actions: "setError",
          },
        },
        invoke: {
          id: "fetchFrame",
          src: fromCallback(
            ({
              input: { cache: cacheUntyped, frameIndex, sceneId },
              sendBack,
            }) => {
              const cache = cacheUntyped as LRUCache<string, ImageBitmap>;
              const cachedFrame = cache.get(frameIndex!);
              console.log(cachedFrame);
              if (cachedFrame) {
                sendBack({ type: "RESOLVE", data: cachedFrame as ImageBitmap });
                return;
              }
              openDB(DB_NAME, 1, {
                upgrade(db) {
                  db.createObjectStore(STORE_NAME);
                },
              }).then((db) =>
                getFrameFromIDB(db!, `${sceneId}_frame_${frameIndex}`!)
                  .then((frameData) =>
                    createImageBitmap(frameData).then((bitmap) => {
                      cache.set(frameIndex!, frameData);
                      sendBack({
                        type: "RESOLVE",
                        data: bitmap,
                      });
                    })
                  )
                  .catch((error) => {
                    if (error.name === "AbortError") {
                      return;
                    }
                    sendBack({ type: "REJECT", error });
                  })
              );

              return () => {};
            }
          ),
          input: ({ context: { cache, db, frameIndex, sceneId } }) => ({
            cache,
            db,
            frameIndex,
            sceneId,
          }),
        },
      },
      success: {
        on: {
          FETCH_FRAME: {
            target: "fetching",
            actions: "setframeIndex",
          },
        },
      },
      error: {
        on: {
          FETCH_FRAME: {
            target: "fetching",
            actions: "setframeIndex",
          },
        },
      },
      error_fatal: {
        type: "final",
      },
    },
  },
  {
    actions: {
      setframeIndex: assign({
        frameIndex: ({ event }) => (event as any).key,
        data: null,
        error: null,
      }),
      setData: assign({
        data: ({ event }) => (event as any).data,
      }),
      setError: assign({
        error: ({ event }) => (event as any).error,
      }),
    },
  }
);
