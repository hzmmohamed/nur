# Inner/Outer Mask Path Design

## Goal

Each mask becomes a pair of bezier paths — an inner path (material boundary) and an outer path (lighting falloff boundary). The outer path defaults to a uniform buffer distance from the inner but can be freely edited independently.

## Data Model

Replace the current per-frame mask value from a single `YLinkedList(BezierPointSchema)` to a struct:

```
MaskSchema = S.Struct({
  inner: YLinkedList(BezierPointSchema),
  outer: YLinkedList(BezierPointSchema),
  bufferDistance: S.Number,        // default: 20 pixels
  outerMode: S.Literal("uniform", "free"),
})
```

The `masks` field on `LayerSchema` becomes:
```
masks: S.Record({ key: frameId, value: MaskSchema })
```

## Outer Path Modes

**Uniform mode** (`outerMode: "uniform"`):
- Outer path is auto-computed from inner path + `bufferDistance`
- Every inner path edit triggers real-time recomputation of the outer path
- Outer path points are written to Y.Doc (persisted, visible to collaborators)
- Buffer distance adjustable via a slider/input in the canvas bar

**Free-edit mode** (`outerMode: "free"`):
- Outer path is fully independent — editing inner does not affect outer
- User can manipulate outer path points/handles directly
- Switching back to uniform regenerates the outer (discards free edits)

## Buffer Algorithm (Uniform Mode)

Point-based offset along normals:

1. For each inner path point at position `(x, y)`:
   - Compute the outward normal direction at that point
   - Offset the point by `bufferDistance` along the normal
   - Scale handle distances proportionally: `outerHandleDist = innerHandleDist * (1 + bufferDistance / radius)` where radius is the local curvature radius (approximated)
2. Write the computed points to the outer `YLinkedList`

Simplified approach for v1: offset each point along the average of its two adjacent edge normals. Handle angles stay the same, handle distances scale by `(1 + bufferDistance / averageEdgeLength)`.

## Canvas Bar Integration

When editing a closed mask, the canvas bar shows:

```
[< Prev] [F3] [Next >]  ● Skin Layer  |  [Inner] [Outer]  Buffer: [===20px===]  [Uniform ▾]  [✕ Exit]
```

- **Inner/Outer toggle**: switches which path the user is editing (points/handles shown for the selected path)
- **Buffer slider**: adjusts `bufferDistance` (only in uniform mode)
- **Mode dropdown**: "Uniform" / "Free Edit" — switching to uniform regenerates outer

## Rendering

- Inner path: filled with layer color at the standard opacity levels (0.15/0.25/0.35)
- Outer path: rendered as a dashed stroke in the layer color at 50% opacity (no fill — it's the falloff boundary, not a region)
- When editing inner: inner path has solid stroke + points, outer shown as dashed outline
- When editing outer (free mode): outer path has solid stroke + points, inner shown as filled region
- In viewing mode: only the inner fill is shown (outer is a editing concern, not a viewing one)

## Copy from Previous Frame

When copying a mask from frame N-1 to frame N, both inner and outer paths are copied, along with `bufferDistance` and `outerMode`.

## Schema Changes

**`packages/core/src/schemas/frame.ts`** (or `layer.ts`):
- Add `MaskSchema` struct
- Update `LayerSchema.masks` value type

**Migration**: existing masks (bare `YLinkedList`) need migration. Existing single path becomes the `inner` path, outer is auto-generated at default buffer distance, mode defaults to `"uniform"`.
