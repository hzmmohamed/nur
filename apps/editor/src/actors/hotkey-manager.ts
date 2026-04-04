import { Atom } from "@effect-atom/atom"
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

// -- Scope stack --

const scopeStack: HotkeyContext[] = []

function getActiveBindings(): ReadonlyArray<HotkeyBinding> {
  if (scopeStack.length === 0) return []
  return scopeStack[scopeStack.length - 1].bindings
}

function parseKey(e: KeyboardEvent): string {
  const parts: Array<string> = []
  if (e.ctrlKey || e.metaKey) parts.push("ctrl")
  if (e.shiftKey) parts.push("shift")
  if (e.altKey) parts.push("alt")
  parts.push(e.key)
  return parts.join("+")
}

// -- Registration functions --

/** Push a hotkey context onto the stack. Only the top context's bindings are active. */
export function pushHotkeyScope(context: HotkeyContext): void {
  scopeStack.push(context)
  syncSet(activeContextIdAtom, context.id)
  hkLog.withContext({ contextId: context.id, stackDepth: scopeStack.length }).info("pushHotkeyScope")
}

/** Pop the top hotkey context. Restores the previous context's bindings. */
export function popHotkeyScope(): void {
  const removed = scopeStack.pop()
  const current = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : null
  syncSet(activeContextIdAtom, current?.id ?? null)
  hkLog.withContext({ removedId: removed?.id, restoredId: current?.id, stackDepth: scopeStack.length }).info("popHotkeyScope")
}

/** Replace the bottom scope (convenience for the base editor context). */
export function registerHotkeyContext(context: HotkeyContext): void {
  // If the stack is empty or the bottom is the same id, replace it
  if (scopeStack.length === 0) {
    scopeStack.push(context)
  } else if (scopeStack[0].id === context.id) {
    scopeStack[0] = context
  } else {
    scopeStack.unshift(context)
  }
  if (scopeStack.length === 1) {
    syncSet(activeContextIdAtom, context.id)
  }
  hkLog.withContext({ contextId: context.id, stackDepth: scopeStack.length }).info("registerHotkeyContext")
}

export function unregisterHotkeyContext(contextId: string): void {
  const idx = scopeStack.findIndex((c) => c.id === contextId)
  if (idx >= 0) scopeStack.splice(idx, 1)
  hkLog.withContext({ contextId, stackDepth: scopeStack.length }).info("unregisterHotkeyContext")
}

// -- Global keydown listener (starts on module load) --

hkLog.info("installing global keydown listener")

window.addEventListener("keydown", (e) => {
  // Skip when typing in an input, textarea, or contenteditable
  const el = document.activeElement
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  ) {
    return
  }

  const key = parseKey(e)
  const bindings = getActiveBindings()
  const binding = bindings.find((b) => b.key === key)
  hkLog.withContext({ key, bindingCount: bindings.length, matched: !!binding }).debug("keydown")
  if (binding) {
    e.preventDefault()
    binding.handler()
  }
})
