---
name: Actor-driven architecture philosophy
description: Every app behavior is owned by a long-running actor (effect-atom or effect-machine). Components are renderers, not behavior owners.
type: feedback
---

Every aspect of the app's behavior must be owned by a long-running actor. Components are pure renderers — they read from atoms and dispatch messages, but never own behavior, manage subscriptions, or coordinate side effects.

**Two kinds of actors:**
1. **effect-atom** — reactive state cells with get/set. Good for derived state, caches, simple reactive values. Lifecycle can be scoped or kept alive.
2. **effect-machine** — explicitly modeled lifecycle with states/transitions. Good for long-running processes: import manager, hotkey manager, frame fetcher, pen tool.

**Why:** Separating behavior from rendering means actors can be tested independently, composed declaratively, and their lifecycle doesn't depend on component mount/unmount. A hotkey manager shouldn't die when a panel unmounts.

**How to apply:**
- Never use `useEffect` for behavior coordination. If you find yourself writing `useEffect(() => { addEventListener(...) })`, that behavior belongs in an actor.
- Components register/unregister with actors (e.g. a component registers a hotkey context on mount), but the actor manages the actual behavior.
- Derived state chains: `currentFrameIndex` atom (writable) → syncs to Yjs awareness → read by `currentFrameImage` atom (derived, cached) → rendered by Konva component.
- Import sessions, hotkey management, frame fetching are effect-machine actors with explicit state machines.
- Workers are invoked by actors, not by components.
