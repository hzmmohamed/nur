import { Machine, State, Event } from "effect-machine/v3"
import { Schema, Effect, Stream } from "effect"
import { Atom } from "@effect-atom/atom"
import * as MutableHashMap from "effect/MutableHashMap"
import { BrowserStream } from "@effect/platform-browser"
import { syncGet, syncSet } from "../lib/atom-registry"

// -- Types --

export interface HotkeyBinding {
  readonly key: string // e.g. "ArrowRight", "ctrl+ArrowLeft", "ctrl+wheel"
  readonly handler: () => void
  readonly description?: string
}

export interface HotkeyContext {
  readonly id: string
  readonly bindings: ReadonlyArray<HotkeyBinding>
}

// -- Atoms --

export const activeContextIdAtom: Atom.Writable<string | null> = Atom.make<string | null>(null)

// -- Internal registry --

const contexts = MutableHashMap.empty<string, HotkeyContext>()

function parseKey(e: KeyboardEvent): string {
  const parts: Array<string> = []
  if (e.ctrlKey || e.metaKey) parts.push("ctrl")
  if (e.shiftKey) parts.push("shift")
  if (e.altKey) parts.push("alt")
  parts.push(e.key)
  return parts.join("+")
}

function getActiveBindings(): ReadonlyArray<HotkeyBinding> {
  const activeId = syncGet(activeContextIdAtom)
  if (!activeId) return []
  const ctx = MutableHashMap.get(contexts, activeId)
  return ctx._tag === "Some" ? ctx.value.bindings : []
}

// -- State --

const HotkeyState = State({
  Running: {},
})

// -- Events --

const HotkeyEvent = Event({
  RegisterContext: { contextId: Schema.String },
  UnregisterContext: { contextId: Schema.String },
  SetFocus: { contextId: Schema.String },
  ClearFocus: {},
})

export { HotkeyState, HotkeyEvent }

// -- Registration functions --
// Called before sending event, since Event can only carry serializable data.

export function registerHotkeyContext(context: HotkeyContext): void {
  MutableHashMap.set(contexts, context.id, context)
}

export function unregisterHotkeyContext(contextId: string): void {
  MutableHashMap.remove(contexts, contextId)
  const activeId = syncGet(activeContextIdAtom)
  if (activeId === contextId) {
    syncSet(activeContextIdAtom, null)
  }
}

// -- Machine --

export const hotkeyManagerMachine = Machine.make({
  state: HotkeyState,
  event: HotkeyEvent,
  initial: HotkeyState.Running,
})
  .on(HotkeyState.Running, HotkeyEvent.RegisterContext, () => HotkeyState.Running)
  .on(HotkeyState.Running, HotkeyEvent.UnregisterContext, () => HotkeyState.Running)
  .on(HotkeyState.Running, HotkeyEvent.SetFocus, ({ event }) => {
    syncSet(activeContextIdAtom, event.contextId)
    return HotkeyState.Running
  })
  .on(HotkeyState.Running, HotkeyEvent.ClearFocus, () => {
    syncSet(activeContextIdAtom, null)
    return HotkeyState.Running
  })
  .background(() =>
    Effect.gen(function* () {
      const keydownStream = BrowserStream.fromEventListenerWindow("keydown")

      yield* keydownStream.pipe(
        Stream.runForEach((e) =>
          Effect.sync(() => {
            const key = parseKey(e)
            const bindings = getActiveBindings()
            const binding = bindings.find((b) => b.key === key)
            if (binding) {
              e.preventDefault()
              binding.handler()
            }
          })
        )
      )
    })
  )
  .build()
