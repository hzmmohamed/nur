import { createStore } from "tinybase/with-schemas";
import { createIndexedDbPersister } from "tinybase/persisters/persister-indexed-db";

import * as UiReact from "tinybase/ui-react/with-schemas";

// A unique Id for this Store.
export const STORE_ID = "myStore";

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

export const MyStoreReact = UiReact as UiReact.WithSchemas<Schemas>;

// Destructure the ui-react module with the schema applied.
const { useProvideStore } = UiReact as UiReact.WithSchemas<Schemas>;

export const myStore = createStore().setSchema(TABLES_SCHEMA, VALUES_SCHEMA);
export const myStorePersister = createIndexedDbPersister(myStore, "nur");
await myStorePersister.load();
myStorePersister.startAutoPersisting();

export const MyStore = () => {
  // Create the Store and set its schema
  // const myStore = useCreateStore(() =>
  //   createStore().setSchema(TABLES_SCHEMA, VALUES_SCHEMA)
  // );

  // Create a local storage persister for the Store and start it

  // useCreatePersister(
  //   myStore,
  //   // @ts-ignore
  //   (myStore) => {
  //     // @ts-ignore
  //     return
  //   },
  //   [],
  //   (persister) => persister.startAutoPersisting()
  // );

  // Provide the Store for the rest of the app.
  useProvideStore(STORE_ID, myStore);

  // Don't render anything.
  return null;
};
