import { Atom } from "@effect-atom/atom"
import { BrowserKeyValueStore } from "@effect/platform-browser"
import * as S from "effect/Schema"

const profileRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)

export const userProfileAtom = Atom.kvs({
  runtime: profileRuntime,
  key: "nur-user-profile",
  schema: S.NullOr(S.Struct({ name: S.String })),
  defaultValue: () => null,
}).pipe(Atom.keepAlive)
