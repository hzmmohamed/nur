# Left Panel & Multi-Mask Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the canvas bar with a full left panel, support multiple masks per layer per frame, and restructure the app layout to left panel / canvas / right panel.

**Architecture:** The schema changes from `Record<frameId, MaskSchema>` to `Record<frameId, Record<maskId, MaskSchema>>` with an optional `name` field on MaskSchema. The layout becomes a three-panel horizontal split. A new `CanvasLeftPanel` component reads machine state and renders contextual content. The canvas-atom iterates multiple masks per frame. The machine's EditMask state gains a `maskId` field.

**Tech Stack:** React, effect-atom, effect-machine v3, effect-yjs, Tailwind CSS, ResizablePanels

---

### Task 1: Update MaskSchema and LayerSchema for multi-mask

**Files:**
- Modify: `packages/core/src/schemas/layer.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Add `name` field to MaskSchema and update Layer masks type**

In `packages/core/src/schemas/layer.ts`, update MaskSchema:

```typescript
export const MaskSchema = S.Struct({
  name: S.NullOr(S.String),
  inner: YLinkedList(BezierPointSchema),
  outer: YLinkedList(BezierPointSchema),
  bufferDistance: S.Number,
  outerMode: OuterModeSchema,
})
```

Update LayerSchema masks field from:
```typescript
masks: S.Record({ key: S.String, value: MaskSchema }),
```
to:
```typescript
masks: S.Record({ key: S.String, value: S.Record({ key: S.String, value: MaskSchema }) }),
```

The outer record key is frameId, the inner record key is maskId.

Update index.ts exports if needed.

**Step 2: Run typecheck** (will fail on consumers — expected)

```bash
npx turbo typecheck --filter=@nur/core
```

---

### Task 2: Update canvas-machine for multi-mask

**Files:**
- Modify: `apps/editor/src/lib/canvas-machine.ts`

**Step 1: Add maskId to EditMask state and EnterEditMask event**

```typescript
EditMask: {
  layerId: S.String,
  maskId: S.String,
  mode: S.Literal("uniform", "free"),
  target: S.Literal("inner", "outer"),
},
```

Update EnterEditMask event:
```typescript
EnterEditMask: { maskId: S.String },
```

Update the transition handler:
```typescript
.on(CanvasState.Editing, CanvasEvent.EnterEditMask, ({ state, event }) =>
  CanvasState.EditMask({ layerId: state.layerId, maskId: event.maskId, mode: "uniform", target: "inner" }),
)
```

Update the derived `editingMaskIdAtom` — add to path-atoms or layer-atoms:
```typescript
/** @derived from canvas machine — do not set directly */
export const editingMaskIdAtom = Atom.make((get): string | null => {
  const state = get(canvasMachineStateAtom)
  return state._tag === "EditMask" ? state.maskId : null
})
```

**Step 2: Run typecheck**

---

### Task 3: Update canvas-atom for multi-mask rendering

**Files:**
- Modify: `apps/editor/src/lib/canvas-atom.ts`

**Context:** The canvas-atom currently focuses to `masks.focus(frameId)` which was a single MaskSchema. Now it's `masks.focus(frameId)` which returns a `Record<maskId, MaskSchema>`. Need to iterate over all masks.

**Step 1: Update `getLayerMasksRecord`**

The function currently returns the masks record at the frame level. Now it returns a `Record<maskId, MaskData>`:

```typescript
function getLayerMasksRecord(layerId: string): Record<string, any> | null {
  try {
    const layerData = (root.focus("layers").focus(layerId) as any).syncGet()
    return layerData?.masks ?? null
  } catch {
    return null
  }
}

function getFrameMasks(layerId: string, frameId: string): Record<string, any> | null {
  const masksRecord = getLayerMasksRecord(layerId)
  if (!masksRecord || !(frameId in masksRecord)) return null
  return masksRecord[frameId] as Record<string, any> ?? null
}
```

**Step 2: Update `syncAllLayerPaths`**

Instead of one BezierPath per layer-frame, create one per mask:

```typescript
function syncAllLayerPaths(frameId: string) {
  disposeAllPaths()
  pathsLayer.destroyChildren()

  const layersRecord = (root.focus("layers").syncGet() ?? {}) as Record<string, any>
  for (const [layerId, layerData] of Object.entries(layersRecord)) {
    const frameMasks = getFrameMasks(layerId, frameId)
    if (!frameMasks) continue

    for (const [maskId, _maskData] of Object.entries(frameMasks)) {
      const maskLens = (root.focus("layers").focus(layerId) as any)
        .focus("masks").focus(frameId).focus(maskId)
      const innerLens = maskLens.focus("inner")
      const outerLens = maskLens.focus("outer")
      const maskData = maskLens.syncGet()
      const pathKey = `${layerId}:${frameId}:${maskId}`
      const bp = new BezierPath(innerLens, pathsLayer, {
        onSelect: () => appRegistry.set(activePathIdRawAtom, pathKey),
        color: (layerData as any).color,
        fillOpacity: 0.25,
        outerLens,
        bufferDistance: maskData?.bufferDistance ?? 20,
        outerMode: maskData?.outerMode ?? "uniform",
        maskLens,
      })
      bp.setActive(false)
      MutableHashMap.set(paths, pathKey, bp)
    }
  }
}
```

**Step 3: Update `syncLayerPaths` similarly** — iterate masks for both the active layer and other layers.

**Step 4: Update drawing-mode path creation** — when creating a new mask during drawing, generate a maskId and initialize within the nested record:

```typescript
const maskId = crypto.randomUUID()
const frameMasksLens = (root.focus("layers").focus(activeLayerId) as any)
  .focus("masks").focus(currentFrameId)
const existingFrameMasks = frameMasksLens.syncGet()
if (!existingFrameMasks) {
  ;(frameMasksLens as any).syncSet({})
}
const maskLens = frameMasksLens.focus(maskId)
;(maskLens as any).syncSet({
  name: null,
  inner: [],
  outer: [],
  bufferDistance: 20,
  outerMode: "uniform",
})
```

**Step 5: Run typecheck**

---

### Task 4: Update layer-atoms for multi-mask

**Files:**
- Modify: `apps/editor/src/lib/layer-atoms.ts`

**Step 1: Update `currentFrameHasMaskAtom`** to return a count instead of boolean:

```typescript
export const currentFrameMaskCountAtom = Atom.make((get): number => {
  // ... same reads as before ...
  const masks = (layer as any).masks ?? {}
  const frameMasks = masks[frame.id]
  if (!frameMasks || typeof frameMasks !== "object") return 0
  return Object.keys(frameMasks).length
})
```

Keep `currentFrameHasMaskAtom` as a derived boolean for backward compat:
```typescript
export const currentFrameHasMaskAtom = Atom.make((get): boolean => {
  return get(currentFrameMaskCountAtom) > 0
})
```

**Step 2: Update `previousFrameMaskExistsAtom`** similarly.

**Step 3: Update `copyMaskFromPreviousAtom`** to copy all masks:

The copy now iterates over all masks in the previous frame and writes them to the current frame with new maskIds.

**Step 4: Update `discardCurrentMaskAtom`** — needs to know which maskId to discard, or discard all masks on the frame. For now, discard all masks on the current frame for the active layer (same as before but one level deeper).

**Step 5: Run typecheck**

---

### Task 5: Create the left panel component

**Files:**
- Create: `apps/editor/src/components/canvas-left-panel.tsx`

**Context:** This is the main new component. It reads `canvasMachineStateAtom` and renders different content based on state. It also reads `layersAtom`, `framesAtom`, `currentFrameAtom` for the mask list.

**Step 1: Create the component with state switching**

The component has 5 render modes matching machine states:
- `renderViewing()` — frame info + mask list grouped by layer
- `renderEmpty()` — fallback for no frames/layers
- `renderEditing()` — focused layer card + mask list + CTAs
- `renderNewMask()` — minimal drawing UI
- `renderEditMask()` — mask properties + mode toggle + buffer controls

Each is a separate function for clarity.

**Step 2: Implement `renderViewing`** — the mask list grouped by layer:

```tsx
function MaskListByLayer({ layers, frameMasks, onFocusLayer }) {
  return layers.map(layer => {
    const masks = frameMasks[layer.id] ?? {}
    const maskEntries = Object.entries(masks)
    const hasMasks = maskEntries.length > 0
    return (
      <div key={layer.id}>
        <div className="flex items-center gap-1.5 px-3 py-1">
          <div className={`size-2 rounded-full ${hasMasks ? '' : 'opacity-30'}`}
               style={{ backgroundColor: layer.color }} />
          <span className={`text-xs ${hasMasks ? '' : 'text-muted-foreground'}`}>
            {layer.name}
          </span>
        </div>
        {maskEntries.map(([maskId, mask], idx) => (
          <div key={maskId} className="flex items-center gap-2 px-6 py-0.5 hover:bg-accent/50 cursor-pointer"
               onClick={() => onFocusLayer(layer.id)}>
            <MaskThumbnail innerPoints={mask.inner} color={layer.color} />
            <span className="text-xs text-muted-foreground">
              {mask.name ?? `#${idx + 1}`}
            </span>
          </div>
        ))}
      </div>
    )
  })
}
```

**Step 3: Implement `MaskThumbnail`** — renders the inner path as a tiny inline SVG:

```tsx
function MaskThumbnail({ innerPoints, color, size = 20 }) {
  const svgData = buildSvgPathData(innerPoints)
  // Compute bounding box and scale to fit
  return (
    <svg width={size} height={size} viewBox="...">
      <path d={svgData} fill={color} opacity={0.4} stroke={color} strokeWidth={1} />
    </svg>
  )
}
```

**Step 4: Implement other render modes** following the design doc.

**Step 5: Run typecheck**

---

### Task 6: Update editor-layout for three-panel layout

**Files:**
- Modify: `apps/editor/src/components/editor-layout.tsx`

**Step 1: Replace two-panel layout with three-panel**

```tsx
export function EditorLayout({ header, canvas, timeline }: EditorLayoutProps) {
  const panelsDisabled = useAtomValue(panelsDisabledAtom)

  return (
    <div className="h-screen flex flex-col">
      {header}

      <ResizablePanelGroup orientation="vertical" className="flex-1">
        <ResizablePanel defaultSize="70%" minSize="30%">
          <div className="flex h-full">
            <ResizablePanelGroup orientation="horizontal" className="flex-1">
              {/* Left Panel */}
              <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%" collapsible collapsedSize="0%">
                <CanvasLeftPanel />
              </ResizablePanel>

              <ResizableHandle />

              {/* Canvas */}
              <ResizablePanel defaultSize="60%" minSize="30%">
                <div className="relative flex flex-col h-full overflow-hidden">
                  <div className="flex-1 min-h-0 relative">
                    {canvas}
                    <CanvasMinimap />
                  </div>
                  <CanvasStatusBar />
                </div>
              </ResizablePanel>

              <ResizableHandle />

              {/* Right Panel — properties only */}
              <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%" collapsible collapsedSize="0%">
                <div className="relative flex flex-col h-full bg-background">
                  {panelsDisabled && <div className="absolute inset-0 z-20 bg-background/60 pointer-events-auto" />}
                  <PropertiesPanel />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Timeline */}
        <ResizablePanel defaultSize="30%" minSize="15%" maxSize="50%" collapsible collapsedSize="0%">
          <div className="relative h-full">
            {panelsDisabled && <div className="absolute inset-0 z-20 bg-background/60 pointer-events-auto" />}
            {timeline}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
```

**Step 2: Remove CanvasBar import and LayersPanel import**

**Step 3: Run typecheck**

---

### Task 7: Remove canvas-bar component

**Files:**
- Delete: `apps/editor/src/components/canvas-bar.tsx`
- Modify: any remaining imports

**Step 1: Delete the file and remove all imports**

The left panel now handles all canvas bar functionality. Any component that imports `CanvasBar` should have the import removed.

**Step 2: Run typecheck and build**

```bash
npx turbo typecheck --filter=@nur/editor
npx turbo build --filter=@nur/editor
```
