import { Layer } from "effect"
import { IndexedDBBlobStore, ImageStore, ImageStoreLive } from "@nur/object-store"

const blobStoreLayer = IndexedDBBlobStore("nur-blobs")

const imageStoreLayer = Layer.effect(
  ImageStore,
  ImageStoreLive,
).pipe(Layer.provide(blobStoreLayer))

export const AppBlobStore = Layer.merge(blobStoreLayer, imageStoreLayer)
