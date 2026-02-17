import { createStore } from "tinybase/with-schemas";
import { createIndexedDbPersister } from "tinybase/persisters/persister-indexed-db";

import * as UiReact from "tinybase/ui-react/with-schemas";

// A unique Id for this Store.
export const STORE_ID = "scenes-store";

// The schema for this Store.
const VALUES_SCHEMA = {} as const;

const TABLES_SCHEMA = {
  scenes: {
    id: { type: "string" },
    name: { type: "string" },
    framesCount: { type: "number", default: 0 },
    fps: { type: "number", default: 24 },
    canvasWidth: { type: "number", default: 1920 },
    canvasHeight: { type: "number", default: 1080 },
    lastUpdatedAt: { type: "number" },
  },
} as const;
type Schemas = [typeof TABLES_SCHEMA, typeof VALUES_SCHEMA];

export const SceneStoreReact = UiReact as UiReact.WithSchemas<Schemas>;

// Destructure the ui-react module with the schema applied.
export const scenesStore = createStore().setSchema(
  TABLES_SCHEMA,
  VALUES_SCHEMA
);
export const scenesStorePersister = createIndexedDbPersister(
  scenesStore,
  "nur"
);
await scenesStorePersister.load();
scenesStorePersister.startAutoPersisting();
