import { Atom } from "@effect-atom/atom"
import * as MutableHashMap from "effect/MutableHashMap"
import { syncGet, syncSet } from "../lib/atom-registry"

// -- Types --

export interface HotkeyBinding {
  readonly key: string // e.g. "ArrowRight", "ctrl+ArrowLeft"
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

// -- Registration functions --

export function registerHotkeyContext(context: HotkeyContext): void {
  MutableHashMap.set(contexts, context.id, context)
  // Auto-focus the registered context
  syncSet(activeContextIdAtom, context.id)
}

export function unregisterHotkeyContext(contextId: string): void {
  MutableHashMap.remove(contexts, contextId)
  const activeId = syncGet(activeContextIdAtom)
  if (activeId === contextId) {
    syncSet(activeContextIdAtom, null)
  }
}

// -- Global keydown listener (starts on module load) --

window.addEventListener("keydown", (e) => {
  const key = parseKey(e)
  const bindings = getActiveBindings()
  const binding = bindings.find((b) => b.key === key)
  if (binding) {
    e.preventDefault()
    binding.handler()
  }
})
