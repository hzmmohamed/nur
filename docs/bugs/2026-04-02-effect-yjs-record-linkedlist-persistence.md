# Bug: `Record<string, YLinkedList>` loses entries after Y.Doc reload

## Summary

When a schema uses `S.Record({ key: S.String, value: YLinkedList(Schema) })` as a field in a `S.Struct`, only the **first** entry created in the Record survives a Y.Doc persistence round-trip. Additional entries created via `recordLens.focus(newKey)` are present in memory (verified via `syncGet()`) but lost after page refresh.

## Reproduction Schema

```ts
const BezierPointSchema = S.Struct({
  x: S.Number,
  y: S.Number,
  handleInAngle: S.Number,
  handleInDistance: S.Number,
  handleOutAngle: S.Number,
  handleOutDistance: S.Number,
})

const FrameSchema = S.Struct({
  id: FrameId,
  index: S.Number.pipe(S.int(), S.nonNegative()),
  contentHash: ContentHash,
  width: S.Number.pipe(S.int(), S.positive()),
  height: S.Number.pipe(S.int(), S.positive()),
  paths: S.Record({ key: S.String, value: YLinkedList(BezierPointSchema) }),
})

const ProjectDocSchema = S.Struct({
  name: S.Trimmed.pipe(S.minLength(1), S.maxLength(200)),
  frames: S.Record({ key: S.String, value: FrameSchema }),
})
```

## Steps to Reproduce

```ts
const { doc, root } = YDocument.make(ProjectDocSchema)

// Assume a frame already exists at root.focus("frames").focus("frame-1")
const pathsLens = root.focus("frames").focus("frame-1").focus("paths")

// Create first path
const path1Lens = pathsLens.focus("path-1")
path1Lens.append({ x: 100, y: 100, handleInAngle: 0, handleInDistance: 0, handleOutAngle: 0, handleOutDistance: 0 })
path1Lens.append({ x: 200, y: 200, handleInAngle: 0, handleInDistance: 0, handleOutAngle: 0, handleOutDistance: 0 })

// Create second path
const path2Lens = pathsLens.focus("path-2")
path2Lens.append({ x: 300, y: 300, handleInAngle: 0, handleInDistance: 0, handleOutAngle: 0, handleOutDistance: 0 })

// Verify both exist in memory
const data = pathsLens.syncGet()
console.log(Object.keys(data))
// ✅ ["path-1", "path-2"]

// Simulate persistence round-trip
const update = Y.encodeStateAsUpdate(doc)
const doc2 = new Y.Doc()
Y.applyUpdate(doc2, update)
const root2 = YDocument.bind(ProjectDocSchema, doc2)
const reloaded = root2.focus("frames").focus("frame-1").focus("paths").syncGet()
console.log(Object.keys(reloaded))
// ❌ Expected: ["path-1", "path-2"]
// ❌ Actual:   ["path-1"]  — path-2 is missing
```

## Observed Behavior (from production logs)

### Session 1: Create two paths

```
createPath done — verify { pathId: "fc565558-...", verifyKeys: ["fc565558-..."] }
// ... add 4 points to path 1, press Escape ...
createPath done — verify { pathId: "048bd974-...", verifyKeys: ["fc565558-...", "048bd974-..."] }
// ... add 3 points to path 2 ...
```

Both paths exist in memory. `verifyKeys` confirms both are visible via `syncGet()`.

### Session 2: Page refresh

```
syncPaths raw data { pathsKeys: ["fc565558-..."] }
// Only path-1 is found. path-2 ("048bd974-...") is gone.
```

The second path and all its points are lost.

## Root Cause Hypothesis

### 1. `buildYjsTree` overwrites on reload

Both `YDocument.make()` and `YDocument.bind()` call `buildYjsTree` inside `doc.transact()`. For TypeLiteral fields (Struct/Record), `buildYjsTree` unconditionally creates a new `Y.Map`:

```ts
// traversal.ts, buildYjsTree
} else if (AST.isTypeLiteral(fieldCore)) {
  const childMap = new Y.Map()
  parent.set(fieldName, childMap)   // ← overwrites existing data
  if (isStruct(fieldCore)) {
    buildYjsTree(fieldCore, childMap, fieldPath)
  }
}
```

When `YDocument.make()` runs before `persistence.sync()`, it creates a fresh empty Y.Map for every Record/Struct field. Then `persistence.sync()` applies stored Y.Doc updates via CRDT merge. If the CRDT merge doesn't correctly restore all Record entries (because `buildYjsTree` created a competing empty Y.Map with a different internal state), data is lost.

### 2. `createRecordLens.focus()` may create non-idempotent Y.Array entries

Each call to `root.focus("frames").focus(frameId).focus("paths")` creates a new `createRecordLens` wrapper. When `.focus(pathId)` is called for the `linkedlist` case:

```ts
if (valueKind === "linkedlist") {
  let childArray = yMap.get(key)
  if (!(childArray instanceof Y.Array)) {
    childArray = new Y.Array()
    yMap.set(key, childArray)
  }
  return createLinkedListLens(valueAST, childArray, doc)
}
```

If the lens chain is re-traversed between creating path-1 and path-2, the intermediate `createRecordLens` may see stale state or create conflicting Y structures.

### 3. Persistence timing

The Y.Doc persistence layer (`storeUpdate`) hooks into `doc.on('update', ...)`. If `buildYjsTree` runs in a transaction before the persistence handler is attached, the initial empty-tree writes are not captured. Then when persistence applies stored updates, the merge may not reconstruct the full state correctly.

## Environment

- effect-yjs: `^0.1.1`
- yjs: `^13.x`
- Persistence: custom IndexedDB-based (`createYDocPersistence`)

## Suggested Test Case

```ts
test("Record containing YLinkedList: multiple entries survive doc reload", () => {
  const Schema = S.Struct({
    items: S.Record({ key: S.String, value: YLinkedList(S.Struct({ x: S.Number, y: S.Number })) }),
  })

  const { doc, root } = YDocument.make(Schema)
  const itemsLens = root.focus("items")

  // Create two entries
  itemsLens.focus("list-1").append({ x: 10, y: 20 })
  itemsLens.focus("list-1").append({ x: 30, y: 40 })
  itemsLens.focus("list-2").append({ x: 50, y: 60 })

  // Verify in memory
  const data = itemsLens.syncGet()
  expect(Object.keys(data)).toEqual(["list-1", "list-2"])
  expect(data["list-1"]).toHaveLength(2)
  expect(data["list-2"]).toHaveLength(1)

  // Round-trip through Y.Doc serialization
  const doc2 = new Y.Doc()
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc))
  const root2 = YDocument.bind(Schema, doc2)
  const reloaded = root2.focus("items").syncGet()

  // This currently fails — only "list-1" survives
  expect(Object.keys(reloaded).sort()).toEqual(["list-1", "list-2"])
  expect(reloaded["list-1"]).toHaveLength(2)
  expect(reloaded["list-2"]).toHaveLength(1)
})
```

## Additional Bug: Edits to restored paths are lost on subsequent reload

After a page refresh, the first path is correctly restored and rendered. If the user then drags a point to a new position (which calls `nodeLens.focus("x").syncSet(newX)` / `nodeLens.focus("y").syncSet(newY)`), the edit appears in memory and renders correctly. But on the next page refresh, the moved point reverts to its original position — the edit is not persisted.

This suggests that the `YLinkedListLens` returned by `createRecordLens.focus(pathId)` after a reload is operating on a **different** `Y.Array` than the one that was restored from persistence. Writes go to the lens's Y.Array (a fresh one created by `focus()`), but reads during `syncPaths` come from the persisted Y.Array. The two diverge, so edits to the "wrong" Y.Array are never captured by the persistence layer's `storeUpdate` handler — or they are captured but overwritten on next reload by `buildYjsTree`.

### Steps to Reproduce

1. Create a path with several points
2. Refresh the page — path restores correctly
3. Drag a point to a new position — renders correctly in memory
4. Refresh the page again
5. **Expected:** Point is at the new position
6. **Actual:** Point reverts to its original position from step 1

**Confirmed by logging:** `nodeLens.focus("x").syncSet(newX)` writes correctly — immediate readback via `nodeLens.syncGet()` returns the new value (`match: true`). The lens is operating on the correct Y.Array in memory. But the data doesn't survive reload.

**Root cause confirmed:** Same as the multi-path bug. `buildYjsTree` in `YDocument.make()` unconditionally creates fresh Y.Map/Y.Array structures with new Yjs internal IDs. The persisted updates reference the **old** Yjs IDs from the previous session. When these updates are applied via `Y.applyUpdate()` in `sync()`, the CRDT merge creates **two** competing structures for the same logical field: one from `buildYjsTree` (empty, new IDs) and one from persistence (data, old IDs). The struct lens's `focus()` then finds the `buildYjsTree` one (it was set last on the Y.Map), so writes go to the empty structure. The persisted data exists in the Y.Doc but is unreachable through the lens.

This explains why:
- Reads via `syncGet()` after restore show the OLD data (from the persisted Y.Array that `readRecordAsObject` finds)
- But the lens returned by `focus(pathId)` wraps the NEW empty Y.Array (from `buildYjsTree`)
- Writes go to the new Y.Array and are persisted to IndexedDB
- But on next reload, `buildYjsTree` creates yet another new Y.Array, shadowing both the original AND the edited data

## Files to Investigate

- `src/traversal.ts` — `buildYjsTree`: should check for existing Y structures before overwriting
- `src/YLens.ts` — `createRecordLens.focus()`: verify idempotency of Y.Array creation for linkedlist values
- `src/YLens.ts` — `createRecordLens.syncGet()` / `readRecordAsObject()`: verify deserialization of YLinkedList values
- `src/YDocument.ts` — `make()` and `bind()`: ordering of `buildYjsTree` vs persistence sync
