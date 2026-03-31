---
name: Use @effect/platform-browser for browser APIs
description: Use Effect platform-browser abstractions instead of raw DOM APIs — BrowserWorker for workers, BrowserStream for event listeners, etc.
type: feedback
---

Use `@effect/platform-browser` for browser-specific APIs instead of raw DOM access.

**Why:** The platform-browser package wraps browser APIs in Effect abstractions that are composable, testable, and integrate with the runtime. Raw `addEventListener`, `new Worker()`, etc. bypass the Effect ecosystem.

**How to apply:**
- **Event streams**: Use `BrowserStream.fromEventListenerWindow("keydown")` instead of `window.addEventListener("keydown", ...)`. This gives you an Effect `Stream` that composes with other streams and respects scope/finalization.
- **Workers**: Use `BrowserWorker.layer` + `Worker.makeSerialized` instead of `new Worker()`. The Effect Worker abstraction handles serialization, lifecycle, and error propagation.
- **KeyValueStore**: Use `BrowserKeyValueStore.layerLocalStorage` if you need localStorage access.
- **Runtime**: Consider `BrowserRuntime` for the app's Effect runtime.

Packages: `@effect/platform` (core abstractions), `@effect/platform-browser` (browser implementations).
