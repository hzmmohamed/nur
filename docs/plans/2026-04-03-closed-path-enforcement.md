# Closed Path Enforcement

**Goal:** Masks must be closed bezier paths. The pen tool enforces this through a modal "New Mask" sub-tool with explicit Done/Discard flow.

---

## Edit Mode Sub-tools

Edit mode has two sub-tools:

- **Edit Mask** (default) — select, move points, adjust handles on existing masks
- **New Mask** — draw a new closed path. Modal: disables all other UI until Done or Discard

## New Mask Mode

### Canvas Bar

```
Drawing (not closed):   F12 ● Skin  3 points   [Done (disabled)] [Discard]
Path closed:            F12 ● Skin  4 points   [Done]            [Discard]
```

- Done: ✓ icon + "Done" text. Disabled until path is closed. Tooltip: "Close the path by clicking the first point" (disabled) / "Commit mask" (enabled)
- Discard: ✗ icon + "Discard" text. Always enabled. Tooltip: "Discard this path"
- Close (✕) button hidden in New Mask mode

### Modal Behavior

- Timeline disabled (no frame switching)
- Layer switching disabled
- Sidebar interactions disabled
- Escape triggers discard (not exit Edit mode)
- Greyed overlay on disabled areas

### Status Bar Hints

- Drawing: "Click to add point · Click first point to close"
- Closed: "Path closed · Click Done to commit mask"
- Edit Mask: "Click a point to select · Drag to move"

## Closed Path Detection

A path is closed when it has 3+ points and the first point's (x, y) equals the last point's (x, y).

### Closing Gesture

When the cursor is within HIT_TOLERANCE (10px) of the first point and there are 3+ points:

- First point fill changes to green (tokens.color.green.500)
- First point radius scales to 1.3x
- Dashed preview line from last point to first point
- Cursor changes to crosshair
- Pointerdown appends a point at exactly the first point's (x, y) → path is now closed

### SVG Rendering

`buildSvgPathData` appends `Z` when first and last points share coordinates.

## Data Model

### AwarenessSchema Change

```ts
drawingState: S.Union(S.Literal("idle"), S.Literal("drawing"), S.Literal("closed"))
```

- idle: Edit Mask mode or no layer selected
- drawing: actively placing points for a new mask
- closed: path closed, waiting for Done/Discard

### Mask Storage

No schema changes. Masks are YLinkedList<BezierPoint>. A mask is valid (closed) when first.x === last.x && first.y === last.y. This is always true for committed masks.

## Done / Discard Actions

- **Done:** drawingState → idle. The mask stays in the Y.Doc. Mask count increments.
- **Discard:** Delete the incomplete path from Y.Doc. drawingState → idle.
- **Auto-discard:** Triggered if user somehow escapes the modal (shouldn't happen with UI disabled, but defensive).

## Implementation Files

| File | Changes |
|------|---------|
| `packages/core/src/schemas/awareness.ts` | Add drawingState field |
| `apps/editor/src/lib/path-atoms.ts` | Add drawingStateAtom, setDrawingStateAtom |
| `apps/editor/src/lib/canvas-atom.ts` | Close detection, snap visuals, enforce modal |
| `apps/editor/src/lib/canvas-objects/bezier-curve.ts` | First-point hover highlight, dashed preview line |
| `apps/editor/src/lib/canvas-objects/bezier-math.ts` | buildSvgPathData Z command for closed paths |
| `apps/editor/src/components/canvas-bar.tsx` | Sub-tool buttons, Done/Discard, point count |
| `apps/editor/src/components/canvas-status-bar.tsx` | Drawing-state-aware hints |
| `apps/editor/src/components/editor-layout.tsx` | Grey overlay on disabled areas during New Mask |
