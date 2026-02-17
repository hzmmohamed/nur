# Bezier Path Class Design

## Overview

A `BezierPath` class that bridges effect-yjs (YLinkedList) with Konva canvas rendering. The class manages a reactive linked list of bezier points, rendering them as draggable Konva objects, and keeping both local edits and remote CRDT updates in sync.

## Data Model

Flat struct for YLinkedList items (each stored as a Y.Map):

```ts
const BezierPointSchema = S.Struct({
  x: S.Number,
  y: S.Number,
  handleInAngle: S.Number,
  handleInDistance: S.Number,    // 0 = no handle (sentinel)
  handleOutAngle: S.Number,
  handleOutDistance: S.Number,   // 0 = no handle (sentinel)
})

const PathDocumentSchema = S.Struct({
  points: YLinkedList(BezierPointSchema),
})
```

Polar handle representation (angle + distance) matches existing domain model. Sentinel `distance: 0` means no handle, avoiding nullable fields.

Reuses `cartesianToPolar` and `polarToCartesian` from `src/lib/domain/coordinate-utils.ts`.

## BezierPath Class

**File:** `src/lib/canvas-objects/bezier-curve.ts`

**Constructor args:**
- `YLinkedListLens<BezierPoint>` - lens into the linked list
- `Konva.Layer` - the layer to draw on

**Internal state:**
- `Registry` from effect-atom - reads/subscribes to atoms
- `HashMap<string, Konva.Group>` - maps node IDs to Konva object groups
- `Konva.Path` - the rendered bezier path line (SVG path data)

### Reactive Loops

1. **Structural loop** - subscribes to `lens.ids()` atom. Diffs against HashMap:
   - Added IDs: create Konva objects, subscribe to node atom
   - Removed IDs: destroy Konva objects, cleanup subscriptions
   - Existing IDs: untouched (stable)

2. **Per-node loop** - for each node, subscribes to `lens.find(id).atom()`. On change:
   - Updates point circle position
   - Converts polar handles to cartesian via `polarToCartesian`
   - Updates handle line endpoints and handle circle positions
   - Toggles handle visibility based on distance > 0

3. **Path rendering** - subscribes to `lens.atom()` (deep). On any change, regenerates SVG path string from all points using M/C commands.

### Konva Objects Per Point

Each point ID maps to a `Konva.Group` containing:
- Point circle (`Konva.Circle`) - draggable, writes `x`/`y` via lens on dragmove
- HandleIn line (`Konva.Line`) - from handle position to point, visible when distance > 0
- HandleIn circle (`Konva.Circle`) - draggable, converts to polar via `cartesianToPolar` on dragmove
- HandleOut line + circle - same pattern

Rendering order: path line behind point groups.

### Edit Pathways

**User -> Yjs:**
- Drag point: `lens.find(id).focus("x").syncSet(...)`, `.focus("y").syncSet(...)`
- Drag handle: compute polar from screen position, write angle/distance fields
- Click stage: `lens.append({ x, y, handleInDistance: 0, handleOutDistance: 0, ... })`
- Click path: find segment, de Casteljau split, `lens.insertAfter(...)` + update neighboring handles

**Yjs -> Konva (remote changes):**
- Atom subscription fires -> update Konva object positions/visibility

### De Casteljau Point Insertion

When clicking on the path line:

1. **Find nearest segment** - iterate point pairs, sample ~20 points per cubic segment, find closest segment + t value to click position (10px tolerance)

2. **Split at t** - given control points (P0, C0out, C1in, P1) and t:
   - Left sub-curve: (P0, L1, L2, M)
   - Right sub-curve: (M, R1, R2, P1)

3. **Update linked list:**
   - Update segment start's handleOut to L1 (converted to polar)
   - Insert new point M with handleIn=L2, handleOut=R1 (polar)
   - Update segment end's handleIn to R2 (polar)

### Cleanup

`dispose()` method: unsubscribes all atom subscriptions, destroys all Konva objects.

## Test Page

**File:** `src/routes/bezier-test.tsx`

**Layout:** Two Konva stages side by side (50% width each).

**Sync:** Two in-memory Y.Docs with direct update exchange:
```ts
doc1.on('update', (update, origin) => {
  if (origin !== 'remote') Y.applyUpdate(doc2, update, 'remote')
})
// bidirectional
```

Both bound to `PathDocumentSchema` via `YDocument.bind`. Each gets its own Registry, lens, Stage, Layer, and BezierPath instance.

**Interactions per stage:**
- Click empty area -> append point (no handles)
- Click path line -> insert point (de Casteljau)
- Drag point -> update position
- Drag handle -> update handle polar coords

Konva stages created imperatively via `useEffect` (no react-konva). BezierPath class is framework-agnostic.
