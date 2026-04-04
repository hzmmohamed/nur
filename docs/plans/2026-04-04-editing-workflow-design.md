# Editing Workflow Redesign

## Goal

Replace the implicit viewing/editing model with explicit states and a persistent contextual canvas bar. Enable sustained frame-by-frame editing sessions scoped to a single layer, with deliberate "Copy from Previous" for mask propagation.

## Editor States

Three states, derived from existing awareness fields:

| State | `activeLayerId` | `drawingState` | `activeTool` |
|-------|----------------|----------------|-------------|
| Viewing | `null` | `"idle"` | `"select"` |
| Editing | `"layer-123"` | `"idle"` | `"select"` or `"pen"` |
| Drawing | `"layer-123"` | `"drawing"` or `"closed"` | `"pen"` |

### Transitions

- **Viewing -> Editing**: click edit icon on layer in timeline, or double-click layer-frame cell
- **Editing -> Viewing**: click "Exit" in canvas bar, or press Escape
- **Editing -> Drawing**: click "New Mask" in canvas bar
- **Drawing -> Editing**: click "Done" (commit) or "Discard"
- **Frame navigation while editing**: user can freely scrub/step frames; stays in editing session for the same layer

## Canvas Bar

Always visible (no slide animation). Content changes based on state:

**Viewing:**
```
[Frame 3/24] [24fps]                              [Fit] [100%]
```

**Editing (frame has mask):**
```
[< Prev] [F3] [Next >]  * Skin Layer     [Edit Mask] [New Mask]  [x Exit]
```

**Editing (frame has no mask, previous frame does):**
```
[< Prev] [F3] [Next >]  * Skin Layer     [Copy from Previous] [New Mask]  [x Exit]
```

**Editing (frame has no mask, no previous either):**
```
[< Prev] [F3] [Next >]  * Skin Layer     [New Mask]  [x Exit]
```

**Drawing:**
```
[F3]  * Skin Layer  -  Drawing new mask     [v Done] [x Discard]
```
Frame nav disabled. Done only active when path is closed.

## Canvas Rendering by State

**Viewing**: frame image + all visible layers' masks as colored overlays.

**Editing**: frame image + active layer's mask editable with bezier handles + other visible layers' masks as dimmed overlays.

**Drawing**: frame image + active layer's in-progress path + existing masks dimmed.

## Timeline Interactions

**Edit entry points:**
- Edit icon button on each layer row in the timeline tree panel
- Double-click a layer-frame cell in the SVG grid (also navigates to that frame)

**While editing:**
- Active layer row highlighted in timeline tree
- Edit icon disabled on other layers
- Frame scrubbing works normally

**While drawing:**
- Timeline panel disabled (panelsDisabledAtom overlay)

## Copy from Previous Frame

Deliberate action, not automatic. When in editing mode on a frame with no mask for the active layer:

1. Canvas bar shows "Copy from Previous" button (only if previous frame has a mask)
2. User clicks it -> deep-copies bezier points from (activeLayer, frame-1) to (activeLayer, frame) in Y.Doc
3. Mask appears immediately, editable
4. Standard Y.Doc undo works

Only copies from frame N-1 (immediate previous), not arbitrary frames.

## New Atoms

- `previousFrameMaskExistsAtom` -- derived, checks if frame-1 has mask for active layer
- `currentFrameHasMaskAtom` -- derived, checks if current frame has mask for active layer
- `copyMaskFromPreviousAtom` -- action, deep-copies mask data in Y.Doc

## Files to Change

- `canvas-bar.tsx` -- rewrite to three-state contextual layout
- `editor-layout.tsx` -- remove max-h animation, always render canvas bar
- `layer-atoms.ts` -- add new derived/action atoms
- `timeline-layers.tsx` -- add edit icon button to layer rows
