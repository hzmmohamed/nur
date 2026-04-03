# Editor Redesign — Layers, Timeline Tracks, Modal Canvas

**Goal:** Restructure the editor around layers as the primary organizational unit. The timeline becomes the layer management surface with per-frame mask indicators. The canvas area transforms between Preview and Edit modes with animated chrome.

---

## Data Model

### ProjectDocSchema

```ts
ProjectDocSchema = S.Struct({
  name: S.Trimmed.pipe(S.minLength(1), S.maxLength(200)),
  frames: S.Record({ key: S.String, value: FrameSchema }),
  layers: S.Record({ key: S.String, value: LayerSchema }),
  layerGroups: S.Record({ key: S.String, value: LayerGroupSchema }),
})
```

### FrameSchema (simplified — paths removed)

```ts
FrameSchema = S.Struct({
  id: FrameId,
  index: S.Number.pipe(S.int(), S.nonNegative()),
  contentHash: ContentHash,
  width: S.Number.pipe(S.int(), S.positive()),
  height: S.Number.pipe(S.int(), S.positive()),
})
```

### LayerSchema (new — owns masks per frame)

```ts
LayerSchema = S.Struct({
  name: S.String.pipe(S.minLength(1)),
  color: S.String.pipe(S.minLength(1)),
  index: S.Number.pipe(S.int(), S.nonNegative()),
  groupId: S.NullOr(S.String),
  masks: S.Record({ key: S.String, value: YLinkedList(BezierPointSchema) }),
})
```

`masks` is keyed by `frameId`. Each value is a closed bezier path for that layer on that frame.

### LayerGroupSchema (new)

```ts
LayerGroupSchema = S.Struct({
  name: S.String.pipe(S.minLength(1)),
  index: S.Number.pipe(S.int(), S.nonNegative()),
})
```

### AwarenessSchema

```ts
AwarenessSchema = S.Struct({
  currentFrame: S.Number.pipe(S.int(), S.nonNegative()),
  activeTool: S.String.pipe(S.minLength(1)),
  activePathId: S.NullOr(S.String),
  activeLayerId: S.NullOr(S.String),
  selection: S.Array(S.String),
  viewport: ViewportSchema,
})
```

---

## Two Modes

Mode is implicit — derived from `activeLayerId`.

### Preview Mode (activeLayerId = null)

- Canvas takes full space, no tool rail, no scope bar
- Viewport bar at bottom (zoom level, fit, reset)
- All layers' masks visible as composite overlay
- Timeline shows all layer tracks, clicking a layer enters Edit mode

### Edit Mode (activeLayerId set)

- Scope bar slides down from top of canvas area (~150ms ease-out)
- Tool rail slides in from left of canvas area (~150ms ease-out)
- Canvas shrinks to accommodate both
- Viewport bar stays at bottom
- Only the selected layer's masks are editable, others dimmed
- Scope bar contains: layer dropdown, frame context, editing tools (Select, Pen), discard (when drawing), close (X)

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  Header (back, project name, frame count)                │
├────────────────────────────────────┬─────────────────────┤
│                                    │                     │
│         Canvas Area                │   Inspector         │
│  (transforms between modes)        │  (contextual)       │
│                                    │                     │
├────────────────────────────────────┴─────────────────────┤
│ ═══ resize handle ═══                                    │
├──────────────┬───────────────────────────────────────────┤
│ Layer names  │  Frame grid with mask indicators          │
│ Group toggles│  ●  ●  ○  ●  ●  ○  ○  ●                  │
│ (synced      │  ○  ●  ●  ●  ○  ○  ●  ●                  │
│  scroll)     │  ▲ playhead                               │
└──────────────┴───────────────────────────────────────────┘
```

### Canvas Area (transforms between modes)

**Preview mode:**
```
┌─────────────────────────────────────┐
│                                     │
│             Canvas                  │
│           (full space)              │
│                                     │
├─────────────────────────────────────┤
│ [Fit] [100%] ───●─── 100%          │
└─────────────────────────────────────┘
```

**Edit mode (animated in):**
```
┌─────────────────────────────────────┐
│ [● Skin ▾] Fr 12/48 [Sel][Pen] [✕] │  ← scope bar slides down
├──┬──────────────────────────────────┤
│  │                                  │
│T │          Canvas                  │  ← tool rail slides in from left
│  │                                  │
├──┴──────────────────────────────────┤
│ [Fit] [100%] ───●─── 100%          │  ← viewport bar (always present)
└─────────────────────────────────────┘
```

### Inspector (right sidebar)

Contextual to selection:
- No selection → project overview or empty
- Layer selected → layer properties (name, color, material, lighting)
- Point selected on canvas → point coordinates
- Collapsible, resizable (same as current)

### Timeline (bottom, resizable)

**Left panel (~160px, fixed):**
- Layer names with color swatch
- Group rows with collapse toggle (▸/▾)
- Click layer → enters Edit mode
- Vertical scroll synced with grid

**Right grid (scrollable both axes):**
- Frame columns, layer rows
- ● = has masks, empty = no masks (extensible for interpolated states)
- Playhead line spanning all rows
- Click cell → navigate to frame + select layer
- Frame numbers sticky at top

**Rendering:** SVG for the grid, HTML for the left panel. All colors from design tokens.

---

## Scope Bar Details

**Contents (left to right):**
1. Layer dropdown — color swatch + name + chevron. Switch layers inline.
2. Frame context — "Frame 12 / 48"
3. Tool buttons — Select, Pen (only available in Edit mode)
4. Discard — visible only when drawing an incomplete mask
5. Close (✕) — exit Edit mode, deselect layer

**Style:** Semi-transparent background with backdrop blur. ~32px height. Compact.

**Animation:** translateY from -100% to 0, 150ms ease-out.

---

## Tool Rail Details

**Only visible in Edit mode.** Slides in from the left (~48px wide).

**Tools:**
- Select (pointer)
- Pen (bezier drawing)
- Future: more mask editing tools

**Animation:** translateX from -100% to 0, 150ms ease-out, synced with scope bar.

---

## Viewport Bar Details

**Always visible** at the bottom of the canvas area in both modes.

**Contents:**
- Fit to frame button
- Zoom presets (50%, 100%, 200%)
- Zoom slider or display
- Current zoom percentage

**Style:** Same semi-transparent + backdrop blur as scope bar. ~28px height.

---

## Implementation Order

1. Update data model (FrameSchema remove paths, LayerSchema add masks, LayerGroupSchema)
2. Update core exports and project-doc-atoms
3. Redesign timeline component (SVG, layer tracks, left panel, grid)
4. Move scope bar inside canvas area with animation
5. Make tool rail conditional and animated
6. Add viewport bar
7. Wire canvas to read masks from layers instead of frames
8. Update import-atoms (frames no longer have paths field)
