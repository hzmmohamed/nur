# Left Panel & Layout Redesign

## Goal

Replace the thin canvas bar with a full left panel for contextual actions, mask browsing, and editing controls. Support multiple masks per layer per frame.

## Layout

```
[Header]
[Left Panel | Canvas | Right Panel]   ← three resizable horizontal
[Timeline (full width)]                ← resizable vertical
```

- **Left Panel**: contextual info + actions. Default ~20%, min 15%, max 35%, collapsible.
- **Canvas**: center, no canvas bar. Status hint text stays as bottom bar.
- **Right Panel**: properties only (material/lighting, future). Layers list removed (redundant with timeline tree). Collapsible.
- **Timeline**: full width, unchanged.

Canvas bar component is removed entirely.

## Left Panel States

### Viewing (no layer focused)

- Frame info: number, fps, dimensions
- Mask list grouped by layer: all layers shown, filled dot = has masks, empty dot = no masks
- Each mask row: layer color + layer name + auto-number + shape thumbnail
- Click a mask row → focuses that layer
- Footer: mask count summary + zoom controls (Fit + percentage)

### Empty project / no layers

- Fallback message prompting the user to import frames or add layers

### Focused layer (Editing state)

- Frame nav (prev/next arrows)
- Focused layer card: color dot + name, mask count on this frame
- Mask thumbnails for the focused layer on this frame
- CTAs: [New Mask], [Copy from Previous] (when applicable), [Edit Mask] on each mask thumbnail
- [Exit] to unfocus
- Other layers section below: dimmed, clickable to switch focus

### New Mask (Drawing state)

- Minimal: status hint ("Click to add points..."), [Done] + [Discard]
- Frame nav disabled
- Other layers hidden

### Edit Mask

- "Editing mask #N" with thumbnail
- Mode toggle: [Uniform] / [Free]
- Buffer: slider + number input
- Inner/Outer toggle (Free mode only)
- Hint: "Drag outer path to adjust visually"
- [Back] to return to focused layer view

## Data Model Change

### Multiple masks per frame

Current:
```
Layer.masks: Record<frameId, MaskSchema>
```

New:
```
Layer.masks: Record<frameId, Record<maskId, MaskSchema>>
```

### MaskSchema update

```
MaskSchema = S.Struct({
  name: S.NullOr(S.String),           // optional user label, display: name ?? "#N"
  inner: YLinkedList(BezierPointSchema),
  outer: YLinkedList(BezierPointSchema),
  bufferDistance: S.Number,
  outerMode: OuterModeSchema,
})
```

- maskId: UUID, generated on creation
- Auto-numbering: display `name ?? "#N"` based on position in record
- Thumbnail: generated client-side from inner path SVG, not persisted

## Impacts

- **editor-layout.tsx**: three-panel horizontal layout replaces current two-panel
- **canvas-bar.tsx**: removed entirely, replaced by left panel component
- **canvas-atom.ts**: iterates multiple masks per layer-frame
- **layer-atoms.ts**: mask presence atoms become counts, copy-from-previous copies all masks
- **timeline.tsx**: frame-layer cells show count or multiple dots
- **layer.ts schema**: masks value type changes to nested Record
- **canvas-machine.ts**: EditMask state needs maskId to identify which mask is being edited
- **Left panel component**: new file, reads machine state + layer/frame atoms

## Right Panel

- Remove LayersPanel (redundant with timeline tree)
- Keep PropertiesPanel placeholder for future material/lighting properties
