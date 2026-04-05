# Canvas Interaction State Machine Design

## Goal

Replace 6 independent writable atoms with a single effect-machine state chart that encodes all canvas interaction modes with guaranteed state transitions.

## States

```
Viewing                                        — no layer selected
Editing { layerId }                            — layer selected, viewing masks
NewMask { layerId }                            — drawing a new mask path
NewMaskClosed { layerId }                      — path closed, awaiting Done/Discard
EditMask { layerId, mode, target }             — editing existing mask paths
  mode: "uniform" | "free"
  target: "inner" | "outer"
```

## Events

```
SelectLayer { layerId }     — Viewing → Editing
DeselectLayer               — Editing/EditMask → Viewing
StartNewMask                — Editing → NewMask
ClosePath                   — NewMask → NewMaskClosed
CommitMask                  — NewMaskClosed → Editing
DiscardMask                 — NewMask/NewMaskClosed → Editing
EnterEditMask               — Editing → EditMask { uniform, inner }
ExitEditMask                — EditMask → Editing
SetOuterMode { mode }       — EditMask → EditMask (reenter)
SetEditingTarget { target } — EditMask → EditMask (reenter)
```

## Slots

```typescript
const Effects = Slot.Effects({
  pushDrawingHotkeys: {},
  popDrawingHotkeys: {},
  discardMaskData: {},
})
```

Side effects per transition:
- StartNewMask: pushDrawingHotkeys
- CommitMask: popDrawingHotkeys
- DiscardMask: popDrawingHotkeys + discardMaskData

All other transitions are pure state changes.

## Derived Atoms

The machine state atom replaces the 6 raw atoms. Existing consumers read from derived atoms that compute from machine state:

```
activeLayerIdRawAtom    — state.layerId or null (Viewing)
drawingStateRawAtom     — "drawing" (NewMask), "closed" (NewMaskClosed), "idle" (else)
activeToolRawAtom       — "pen" (NewMask/NewMaskClosed), "select" (else)
editMaskModeAtom        — true if EditMask
editingPathTargetAtom   — state.target if EditMask, "inner" otherwise
```

All marked with `@derived from canvas machine — do not set directly`.

Setter aliases removed — state changes go through `actor.sendSync(Event.X)`.

## Reactive Cascade (no explicit renderer calls)

State transitions update `canvasMachineStateAtom` → derived atoms recompute → canvas-atom subscriptions fire → renderer re-syncs automatically.

Example: CommitMask
```
actor.sendSync(Event.CommitMask)
  → machine: NewMaskClosed → Editing (pops hotkey scope)
  → canvasMachineStateAtom updates
  → drawingStateRawAtom derives "idle"
  → canvas-atom subscription fires syncPaths()
  → drawing-mode BezierPath disposed, replaced with fill-only render
```

## File Structure

- `apps/editor/src/lib/canvas-machine.ts` — Machine definition, state/event schemas, slots, build
- `apps/editor/src/lib/path-atoms.ts` — Derived atoms from machine state (replaces raw writable atoms)
- `apps/editor/src/lib/layer-atoms.ts` — `activeLayerIdRawAtom` becomes derived
- `apps/editor/src/components/canvas-bar.tsx` — Sends machine events instead of setting atoms
- `apps/editor/src/lib/drawing-actions.ts` — Sends machine events instead of setting atoms
- `apps/editor/src/lib/canvas-atom.ts` — Subscribes to machine state for rendering decisions
