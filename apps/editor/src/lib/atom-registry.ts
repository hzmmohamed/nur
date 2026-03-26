/**
 * Shared module-level AtomRegistry for sync read/write from non-React contexts
 * (e.g., effect-machine `.on()` handlers).
 *
 * React components should use the same registry via the RegistryContext provider.
 */
import * as Registry from "@effect-atom/atom/Registry"
import type * as Atom from "@effect-atom/atom/Atom"

/**
 * Module-level registry singleton. Used by machine `.on()` handlers
 * for synchronous atom updates, and shared with the React tree via
 * a RegistryContext provider wrapping the app.
 */
export const appRegistry: Registry.Registry = Registry.make()

/** Synchronously read an atom's current value. */
export function syncGet<A>(atom: Atom.Atom<A>): A {
  return appRegistry.get(atom)
}

/** Synchronously set a writable atom's value. */
export function syncSet<R, W>(atom: Atom.Writable<R, W>, value: W): void {
  appRegistry.set(atom, value)
}
