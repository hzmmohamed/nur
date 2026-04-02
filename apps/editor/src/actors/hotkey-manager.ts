import { Atom } from "@effect-atom/atom"
import * as MutableHashMap from "effect/MutableHashMap"
import { syncSet } from "../lib/atom-registry"
import { createModuleLogger } from "../lib/logger"

const hkLog = createModuleLogger("hotkey-manager")

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

function getAllBindings(): ReadonlyArray<HotkeyBinding> {
  const result: HotkeyBinding[] = []
  MutableHashMap.forEach(contexts, (ctx) => {
    for (const b of ctx.bindings) result.push(b)
  })
  return result
}

// -- Registration functions --

export function registerHotkeyContext(context: HotkeyContext): void {
  MutableHashMap.set(contexts, context.id, context)
  hkLog.withContext({ contextId: context.id, bindingCount: context.bindings.length }).info("registerHotkeyContext")
}

export function unregisterHotkeyContext(contextId: string): void {
  MutableHashMap.remove(contexts, contextId)
  hkLog.withContext({ contextId }).info("unregisterHotkeyContext")
}

export function focusHotkeyContext(contextId: string): void {
  syncSet(activeContextIdAtom, contextId)
}

// -- Global keydown listener (starts on module load) --

hkLog.info("installing global keydown listener")

window.addEventListener("keydown", (e) => {
  const key = parseKey(e)
  const bindings = getAllBindings()
  const binding = bindings.find((b) => b.key === key)
  hkLog.withContext({ key, bindingCount: bindings.length, matched: !!binding }).debug("keydown")
  if (binding) {
    e.preventDefault()
    binding.handler()
  }
})
