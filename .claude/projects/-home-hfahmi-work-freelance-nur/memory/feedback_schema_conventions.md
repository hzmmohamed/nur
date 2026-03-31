---
name: Schema and state conventions
description: Effect Schema conventions for NUR — branded IDs, trimmed strings, length constraints, effect-atom over useState
type: feedback
---

Use effect-atom instead of useState for any reactive state that needs to be accessed via hooks. useState is fine only for purely local transient UI state (e.g. controlled input value). Anything backed by Yjs or shared state should use effect-atom.

**Why:** Consistency — effect-atom is the chosen reactive primitive. It integrates with effect-yjs's `.atom()` method and keeps state management uniform.

**How to apply:** When writing React hooks that expose Yjs-backed state, use the atom API from effect-yjs lenses (`.atom()`) rather than `useState` + manual `doc.on("update", ...)` listeners.

---

All Effect Schemas in @nur/core must follow these rules:

1. **Branded IDs**: Every entity ID must be a branded type using `S.String.pipe(S.brand("ProjectId"))` (or similar). IDs should validate as UUID format (`S.UUID`). This makes function signatures type-safe — `projectId: ProjectId` instead of `projectId: string`.

2. **No bare `S.String`**: All user-facing strings must use `S.Trimmed` (auto-trims whitespace) and have `S.minLength` / `S.maxLength` constraints appropriate to the field.

3. **Semantic validation**: Schemas should encode the semantics of what they represent — not just structural types. E.g. frame dimensions should be positive integers, timestamps should be positive numbers.

4. **Type exports**: Export the branded type using `S.Schema.Type<typeof SomeSchema>` so consumers get the branded types in their signatures.

**Why:** Bare strings and unbranded IDs lead to subtle bugs where any string can be passed as any ID. Trimming prevents whitespace-only names. Length constraints prevent abuse.

**How to apply:** When creating or modifying any schema in `packages/core/src/schemas/`, apply these rules. Review existing schemas when touching them.

---

Prefer Effect-TS data structures over native JS or third-party equivalents. Use `HashMap`, `HashSet`, `Queue`, `Ref`, `Dequeue`, `MutableRef`, `MutableHashMap`, etc. from the `effect` package instead of `Map`, `Set`, plain objects as maps, or third-party collections.

**Why:** Effect data structures are immutable by default, integrate with the Effect ecosystem (pipes, equality, hashing), and provide consistent APIs. Using native `Map`/`Set` or third-party collections fragments the codebase and loses Effect interop.

**How to apply:** When writing any new code that needs a map, set, queue, or ref — reach for the Effect version first. Only use native JS structures at boundaries where React or browser APIs require them (e.g. `useState`, DOM event handlers).
