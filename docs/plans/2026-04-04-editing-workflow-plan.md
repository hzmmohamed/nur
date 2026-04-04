# Editing Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the implicit viewing/editing model with a three-state contextual canvas bar (Viewing/Editing/Drawing) and add "Copy from Previous Frame" mask propagation.

**Architecture:** The canvas bar becomes always-visible with content switching based on editor state (derived from existing awareness atoms). New derived atoms detect mask presence on the current/previous frame. A new action atom deep-copies mask data between frames in the Y.Doc.

**Tech Stack:** React, effect-atom, effect-yjs, Yjs, Tailwind CSS

---

### Task 1: Add derived mask-presence atoms

**Files:**
- Modify: `apps/editor/src/lib/layer-atoms.ts`

**Context:** These atoms read from `activeEntryAtom`, `activeLayerIdAtom`, and `currentFrameAtom` to determine if the active layer has mask data on the current and previous frames. They drive the canvas bar's conditional button rendering.

**Step 1: Add `currentFrameHasMaskAtom`**

After `isEditModeAtom`, add:

```typescript
/** Whether the active layer has a mask on the current frame */
export const currentFrameHasMaskAtom = Atom.make((get): boolean => {
  const layerIdResult = get(activeLayerIdAtom)
  if (!Result.isSuccess(layerIdResult) || !layerIdResult.value) return false
  const layerId = layerIdResult.value

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return false
  const layer = layersResult.value.find((l) => l.id === layerId)
  if (!layer) return false

  const framesResult = get(framesAtom)
  if (!Result.isSuccess(framesResult)) return false
  const frames = framesResult.value

  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(currentResult)) return false
  const currentIdx = currentResult.value as number

  const frame = frames[currentIdx]
  if (!frame) return false

  const masks = (layer as any).masks ?? {}
  return frame.id in masks
})
```

Import `framesAtom` and `currentFrameAtom` from `./project-doc-atoms` (add to existing import).

**Step 2: Add `previousFrameMaskExistsAtom`**

```typescript
/** Whether the active layer has a mask on the previous frame (currentFrame - 1) */
export const previousFrameMaskExistsAtom = Atom.make((get): boolean => {
  const layerIdResult = get(activeLayerIdAtom)
  if (!Result.isSuccess(layerIdResult) || !layerIdResult.value) return false
  const layerId = layerIdResult.value

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return false
  const layer = layersResult.value.find((l) => l.id === layerId)
  if (!layer) return false

  const framesResult = get(framesAtom)
  if (!Result.isSuccess(framesResult)) return false
  const frames = framesResult.value

  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(currentResult)) return false
  const currentIdx = currentResult.value as number

  if (currentIdx <= 0) return false
  const prevFrame = frames[currentIdx - 1]
  if (!prevFrame) return false

  const masks = (layer as any).masks ?? {}
  return prevFrame.id in masks
})
```

**Step 3: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 2: Add `copyMaskFromPreviousAtom`

**Files:**
- Modify: `apps/editor/src/lib/layer-atoms.ts`

**Context:** This action atom deep-copies the bezier point data from frame N-1 to frame N for the active layer. It reads the Y.Doc mask data (a YLinkedList of BezierPoints) from the previous frame and writes a copy to the current frame. Uses raw Y.Doc access inside a transaction because the lens API doesn't support cross-frame mask cloning.

**Step 1: Add the action atom**

```typescript
/** Copy mask from previous frame to current frame for the active layer */
export const copyMaskFromPreviousAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (_: void, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const activeLayerId = (entry.awareness.local.focus("activeLayerId") as any).syncGet() as string | null
    if (!activeLayerId) return

    const currentFrame = entry.awareness.local.focus("currentFrame").syncGet() as number
    if (currentFrame <= 0) return

    const rawFrames = (entry.root.focus("frames").syncGet() ?? {}) as Record<string, any>
    const frames = Object.values(rawFrames).sort((a: any, b: any) => a.index - b.index)
    const prevFrame = frames[currentFrame - 1] as { id: string } | undefined
    const currFrame = frames[currentFrame] as { id: string } | undefined
    if (!prevFrame || !currFrame) return

    // Read source mask data
    const layersMap = entry.doc.getMap("root").get("layers") as any
    if (!layersMap) return
    const layerMap = layersMap.get(activeLayerId) as any
    if (!layerMap) return
    const masksMap = layerMap.get("masks") as any
    if (!masksMap) return

    const srcMask = masksMap.get(prevFrame.id)
    if (!srcMask) return

    // Deep-copy: serialize source linked list points, create new entries in target
    entry.doc.transact(() => {
      // Clone the YLinkedList by reading all points and writing them to a new list
      // The mask is a YLinkedList — its Yjs backing is a Y.Map with _head, nodes, etc.
      // Simplest approach: read via lens, write via lens
      const srcPoints = entry.root
        .focus("layers").focus(activeLayerId).focus("masks").focus(prevFrame.id)
        .syncGet()

      if (srcPoints) {
        ;(entry.root
          .focus("layers").focus(activeLayerId).focus("masks").focus(currFrame.id) as any)
          .syncSet(srcPoints)
      }
    })
  }),
)
```

**Step 2: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 3: Rewrite canvas bar — always visible, three-state layout

**Files:**
- Modify: `apps/editor/src/components/canvas-bar.tsx` (full rewrite)
- Modify: `apps/editor/src/components/editor-layout.tsx:38-45` (remove slide animation)

**Step 1: Update editor-layout.tsx**

Replace the conditional slide animation with always-visible rendering:

```typescript
// OLD (lines 38-45):
{/* Canvas bar — slides down in Edit mode */}
<div
  className={`transition-all duration-150 ease-out overflow-hidden ${
    isEditMode ? "max-h-10" : "max-h-0"
  }`}
>
  <CanvasBar />
</div>

// NEW:
<CanvasBar />
```

Remove the `isEditModeAtom` import since it's no longer used in this file (check if `isEditMode` is used elsewhere in the component first — it is not).

**Step 2: Rewrite canvas-bar.tsx**

Full rewrite with three states. The component reads:
- `activeLayerAtom` — null = Viewing state
- `drawingStateAtom` — "idle" = Editing, "drawing"/"closed" = Drawing
- `currentFrameAtom`, `framesAtom` — frame display and nav
- `currentFrameHasMaskAtom` — show "Edit Mask" vs "Copy from Previous" / "New Mask"
- `previousFrameMaskExistsAtom` — show "Copy from Previous" button
- `activeToolAtom` — highlight active tool

Actions:
- `setActiveLayerIdAtom(null)` — exit editing
- `setActiveToolAtom("select"/"pen")` — switch tools
- `setDrawingStateAtom("drawing")` — enter drawing mode
- `setCurrentFrameAtom(n)` — prev/next frame nav
- `copyMaskFromPreviousAtom` — copy mask
- `commitNewMask()` / `discardNewMask()` — drawing mode actions

```typescript
import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import {
  activeLayerAtom,
  setActiveLayerIdAtom,
  currentFrameHasMaskAtom,
  previousFrameMaskExistsAtom,
  copyMaskFromPreviousAtom,
} from "../lib/layer-atoms"
import {
  activeToolAtom,
  setActiveToolAtom,
  drawingStateAtom,
  setDrawingStateAtom,
} from "../lib/path-atoms"
import { framesAtom, currentFrameAtom, setCurrentFrameAtom } from "../lib/project-doc-atoms"
import { zoomAtom, setZoomAtom, resetViewSignalAtom } from "../lib/viewport-atoms"
import { appRegistry } from "../lib/atom-registry"
import { pushHotkeyScope } from "../actors/hotkey-manager"
import { commitNewMask, discardNewMask } from "../lib/drawing-actions"
import { Button } from "@/components/ui/button"

export function CanvasBar() {
  // -- State reads --
  const activeLayerResult = useAtomValue(activeLayerAtom)
  const activeLayer = Result.isSuccess(activeLayerResult) ? activeLayerResult.value : null

  const drawingResult = useAtomValue(drawingStateAtom)
  const drawingState = Result.isSuccess(drawingResult) ? drawingResult.value : "idle"
  const isDrawing = drawingState !== "idle"
  const isClosed = drawingState === "closed"

  const toolResult = useAtomValue(activeToolAtom)
  const activeTool = Result.isSuccess(toolResult) ? toolResult.value : "select"

  const framesResult = useAtomValue(framesAtom)
  const frames = framesResult._tag === "Success" ? framesResult.value : []
  const frameCount = frames.length

  const currentFrameResult = useAtomValue(currentFrameAtom) as Result.Result<number>
  const currentFrame = Result.isSuccess(currentFrameResult) ? currentFrameResult.value : 0

  const hasMask = useAtomValue(currentFrameHasMaskAtom)
  const hasPrevMask = useAtomValue(previousFrameMaskExistsAtom)

  const zoomResult = useAtomValue(zoomAtom)
  const zoom = Result.isSuccess(zoomResult) ? zoomResult.value : 1

  // -- Setters --
  const setActiveLayerId = useAtomSet(setActiveLayerIdAtom)
  const setTool = useAtomSet(setActiveToolAtom)
  const setDrawingState = useAtomSet(setDrawingStateAtom)
  const triggerSetFrame = useAtomSet(setCurrentFrameAtom)
  const copyFromPrev = useAtomSet(copyMaskFromPreviousAtom)
  const setZoom = useAtomSet(setZoomAtom)

  const isEditing = !!activeLayer
  const barClass = "flex items-center gap-2 px-3 py-1 bg-background/80 backdrop-blur-sm border-b border-border text-xs"

  // -- Drawing state --
  if (isEditing && isDrawing) {
    return (
      <div className={barClass}>
        <span className="font-semibold tabular-nums">F{currentFrame + 1}</span>
        <LayerIndicator name={activeLayer.name} color={activeLayer.color} />
        <span className="text-muted-foreground">Drawing new mask</span>
        <div className="flex-1" />
        <Button
          variant={isClosed ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          disabled={!isClosed}
          onClick={commitNewMask}
          title={isClosed ? "Commit mask" : "Close the path first"}
        >
          <CheckIcon className="size-3" /> Done
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1 text-destructive-foreground"
          onClick={discardNewMask}
        >
          <CloseIcon className="size-3" /> Discard
        </Button>
      </div>
    )
  }

  // -- Editing state --
  if (isEditing) {
    return (
      <div className={barClass}>
        {/* Frame nav */}
        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0"
          disabled={currentFrame <= 0}
          onClick={() => triggerSetFrame(currentFrame - 1)}
          aria-label="Previous frame"
        >
          <ChevronLeftIcon className="size-3.5" />
        </Button>
        <span className="font-semibold tabular-nums">F{currentFrame + 1}</span>
        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0"
          disabled={currentFrame >= frameCount - 1}
          onClick={() => triggerSetFrame(currentFrame + 1)}
          aria-label="Next frame"
        >
          <ChevronRightIcon className="size-3.5" />
        </Button>

        <LayerIndicator name={activeLayer.name} color={activeLayer.color} />

        <div className="flex-1" />

        {/* Contextual mask actions */}
        {hasMask ? (
          <Button
            variant={activeTool === "select" ? "secondary" : "ghost"}
            size="sm" className="h-6 px-2 text-xs"
            onClick={() => setTool("select")}
          >
            Edit Mask
          </Button>
        ) : hasPrevMask ? (
          <Button
            variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => copyFromPrev(undefined)}
          >
            Copy from Previous
          </Button>
        ) : null}

        <Button
          variant="ghost" size="sm" className="h-6 px-2 text-xs"
          onClick={() => {
            setTool("pen")
            setDrawingState("drawing")
            pushHotkeyScope({
              id: "drawing",
              bindings: [{ key: "Escape", handler: discardNewMask }],
            })
          }}
        >
          New Mask
        </Button>

        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0"
          onClick={() => setActiveLayerId(null)}
          aria-label="Exit edit mode"
        >
          <CloseIcon className="size-3.5" />
        </Button>
      </div>
    )
  }

  // -- Viewing state --
  return (
    <div className={barClass}>
      <span className="tabular-nums text-muted-foreground">
        {frameCount > 0 ? `Frame ${currentFrame + 1} / ${frameCount}` : "No frames"}
      </span>
      {frameCount > 0 && (
        <span className="text-muted-foreground/60">24fps</span>
      )}
      <div className="flex-1" />
      <Button
        variant="ghost" size="sm"
        className="h-5 px-1 text-xs text-muted-foreground"
        onClick={() => {
          setZoom(1)
          appRegistry.set(resetViewSignalAtom, (appRegistry.get(resetViewSignalAtom) as number) + 1)
        }}
      >
        Fit
      </Button>
      <span className="tabular-nums w-10 text-right text-muted-foreground">{Math.round(zoom * 100)}%</span>
    </div>
  )
}

function LayerIndicator({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground truncate max-w-24">{name}</span>
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
```

**Step 3: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 4: Add edit icon to timeline layer rows

**Files:**
- Modify: `apps/editor/src/components/timeline-layers.tsx`

**Context:** Add a pencil icon button to each layer row in the tree. Clicking it enters editing mode by setting `activeLayerIdAtom`. While another layer is being edited (or while drawing), the edit button is disabled on non-active layers.

**Step 1: Add PencilIcon**

After the existing icon components:

```typescript
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}
```

**Step 2: Add to LayerNodeRendererProps**

```typescript
interface LayerNodeRendererProps {
  // ... existing
  isActiveForEditing: boolean
  onEdit: (layerId: string) => void
}
```

**Step 3: Add edit button to layer rows**

In `LayerNodeRenderer`, add an edit button in the hover actions area. For layers only (not groups):

```typescript
{data.type === "layer" && (
  <button
    className={`flex items-center justify-center size-5 rounded transition-colors ${
      isActiveForEditing
        ? "text-foreground bg-accent"
        : "text-muted-foreground hover:text-foreground hover:bg-accent"
    }`}
    onClick={(e) => {
      e.stopPropagation()
      onEdit(data.layerId)
    }}
    title={isActiveForEditing ? "Currently editing" : "Edit layer"}
  >
    <PencilIcon className="size-3" />
  </button>
)}
```

Place it before the duplicate/delete buttons, and make it always visible (not hover-gated).

**Step 4: Wire into TimelineLayers**

In the `renderNode` callback, pass:
- `isActiveForEditing={props.node.data.layerId === activeLayerId}`
- `onEdit={(id) => setActiveLayerId(id)}`

**Step 5: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 5: Remove or simplify canvas status bar

**Files:**
- Modify: `apps/editor/src/components/canvas-status-bar.tsx`
- Modify: `apps/editor/src/components/editor-layout.tsx`

**Context:** The status bar's hint text and zoom controls are now in the canvas bar. The status bar can be simplified to just show contextual hints (editing tips) without the zoom/fit controls.

**Step 1: Simplify canvas-status-bar.tsx**

Remove the zoom/fit controls (now in canvas bar viewing state). Keep only the hint text:

```typescript
import { Result } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { isEditModeAtom } from "../lib/layer-atoms"
import { drawingStateAtom } from "../lib/path-atoms"

export function CanvasStatusBar() {
  const isEditMode = useAtomValue(isEditModeAtom)
  const drawingResult = useAtomValue(drawingStateAtom)
  const drawingState = Result.isSuccess(drawingResult) ? drawingResult.value : "idle"

  let hint: string
  if (!isEditMode) {
    hint = "Select a layer to start editing"
  } else if (drawingState === "drawing") {
    hint = "Click to add point \u00b7 Click first point to close"
  } else if (drawingState === "closed") {
    hint = "Path closed \u00b7 Click Done to commit mask"
  } else {
    hint = "Click a point to select \u00b7 Drag to move"
  }

  return (
    <div className="flex items-center px-3 py-0.5 border-t border-border text-xs text-muted-foreground">
      <span className="truncate">{hint}</span>
    </div>
  )
}
```

**Step 2: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

---

### Task 6: Final integration and typecheck

**Files:**
- All modified files

**Step 1: Run full typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

**Step 2: Run build**

```bash
npx turbo build --filter=@nur/editor
```

**Step 3: Visual verification checklist**

- [ ] Canvas bar visible in viewing mode with frame count and zoom
- [ ] Clicking edit on a layer enters editing mode — canvas bar shows frame nav + tools
- [ ] "New Mask" enters drawing mode — canvas bar shows Done/Discard
- [ ] Done commits, Discard discards, both return to editing state
- [ ] Navigating to empty frame shows "Copy from Previous" when previous has mask
- [ ] Clicking "Copy from Previous" creates the mask
- [ ] Exit button returns to viewing mode
- [ ] Escape returns to viewing mode from editing
- [ ] Drawing mode disables timeline panel
