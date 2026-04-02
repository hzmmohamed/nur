# Editor UX Design

**Goal:** Define the editor's layout, interaction modes, and information hierarchy for the NUR animation masking workflow.

---

## Mental Model

The user thinks in scopes, from broad to narrow:

```
Project
  └── Layer (named material region — "skin", "ear", "fabric")
        └── Frame N
              └── Mask (closed bezier path defining the layer's region on this frame)
```

Layers group masks across frames. A "skin" layer has one mask per frame. Layers can be grouped (e.g., under a character name). The mask must be a closed path to be valid — incomplete paths are not rendered as masks.

---

## Two Modes

Mode is implicit — derived from whether a layer is selected.

### Preview Mode (no layer selected)

- **Canvas:** Shows composite of all layers on the current frame
- **Timeline:** Scrub/loop freely
- **Sidebar:** Layers panel shows all layers, Properties panel is empty
- **Scope bar:** Hidden — no active scope
- **Tool rail:** Select tool only (no mask editing)

### Edit Mode (layer selected)

- **Canvas:** Selected layer's mask is highlighted/editable. Other layers fade to background overlay.
- **Timeline:** Frame navigation persists layer selection — scrubbing shows the selected layer's mask on each frame
- **Sidebar:** Layers panel highlights selected layer, Properties panel shows layer settings (material, lighting, color)
- **Scope bar:** Visible below header — shows active layer, frame context, actions
- **Tool rail:** Full tools available (Select, Pen)

**Entering Edit mode:** Click a layer in the Layers panel, or click a mask on the canvas.

**Exiting Edit mode:** Press Escape, click the X in the scope bar, or click empty canvas in Select mode.

---

## Layout

```
┌──────────────────────────────────────────────┐
│  Header (back, project name, frame info)     │
├──────────────────────────────────────────────┤
│  Scope Bar (Edit mode only)                  │
│  [Layer dropdown ▾] [●] Skin / Frame 12  [✕] │
├──┬────────────────────────────┬──────────────┤
│  │                            │   Layers     │
│T │         Canvas             ├──────────────┤
│  │                            │  Properties  │
│  │                            │              │
├──┴────────────────────────────┴──────────────┤
│ ═══ resize handle ═══                        │
├──────────────────────────────────────────────┤
│              Timeline                        │
└──────────────────────────────────────────────┘
```

### Header (fixed)
- Back button (link to home)
- Project name
- Frame count, current frame indicator

### Scope Bar (conditional, below header)
- Only visible when a layer is selected (Edit mode)
- Spans full width below header, above canvas area
- Contents:
  - **Layer dropdown** — switch layers without going to sidebar
  - **Color indicator** — small swatch showing the layer's assigned color
  - **Context text** — "Layer Name / Frame N"
  - **Close button (X)** — deselect layer, return to Preview mode

### Tool Rail (48px fixed, left)
- Vertical icon buttons: Select, Pen
- Not a resizable panel — fixed width strip
- `aria-orientation="vertical"`, keyboard accessible

### Canvas (fills remaining space)
- Konva stage with frame image + bezier path overlay
- Frame drop zone overlay when no frames imported
- In Edit mode: selected layer's mask editable, others dimmed

### Right Sidebar (resizable, collapsible)
- Default: 25% width, min 15%, max 40%, collapsible to 0%
- Two stacked panels:
  - **Layers Panel** — list of all layers, click to select (enters Edit mode)
  - **Properties Panel** — contextual to selected layer (material, lighting settings)

### Timeline (resizable, collapsible, bottom)
- Default: 15% height, min 8%, max 40%, collapsible to 0%
- Frame scrubbing, playhead, zoom
- Layer selection persists across frame changes

---

## Information Flow

Information flows top-to-bottom, left-to-right:

1. **Top:** Mode context (scope bar) — "where am I?"
2. **Left:** Tools — "what can I do?"
3. **Center:** Canvas — "what am I looking at?"
4. **Right:** Data panels — "what are the details?"
5. **Bottom:** Timeline — "when am I?"

---

## Data Model Changes (future)

Current schema:
```
Frame → paths: Record<string, YLinkedList<BezierPoint>>
```

Future schema (for layers):
```
Project → layers: Record<string, Layer>
Layer → { name, color, masks: Record<frameId, YLinkedList<BezierPoint>> }
```

A mask is a closed bezier path. Incomplete paths are stored in Yjs as they're drawn but not rendered as masks until closed. The mask creation gesture must result in a closed path or the path is discarded.

---

## Implementation Status

| Component | Status |
|-----------|--------|
| EditorLayout (resizable shell) | Done |
| ToolRail | Done |
| Layers Panel (placeholder) | Done |
| Properties Panel (placeholder) | Done |
| Resizable right sidebar | Done |
| Resizable timeline | Done |
| Scope bar | Not started |
| Preview/Edit mode switching | Not started |
| Layer data model | Not started |
| Closed path enforcement | Not started |
| Layer dropdown in scope bar | Not started |
