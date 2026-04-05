import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import {
  activeLayerAtom,
  currentFrameHasMaskAtom,
  previousFrameMaskExistsAtom,
  copyMaskFromPreviousAtom,
  editingPathTargetAtom,
  editMaskModeAtom,
  maskBufferDistanceAtom,
  maskOuterModeAtom,
  setBufferDistanceAtom,
} from "../lib/layer-atoms"
import {
  drawingStateAtom,
} from "../lib/path-atoms"
import { framesAtom, currentFrameAtom, setCurrentFrameAtom } from "../lib/project-doc-atoms"
import { zoomAtom, setZoomAtom, resetViewSignalAtom } from "../lib/viewport-atoms"
import { appRegistry } from "../lib/atom-registry"
import { CanvasEvent, canvasActor } from "../lib/canvas-machine"
import { Button } from "@/components/ui/button"

const BAR_CLASS = "flex items-center gap-2 px-3 py-1 bg-background/80 backdrop-blur-sm border-b border-border text-xs min-h-8"

export function CanvasBar() {
  // -- State reads --
  const activeLayerResult = useAtomValue(activeLayerAtom)
  const activeLayer = Result.isSuccess(activeLayerResult) ? activeLayerResult.value : null

  const drawingResult = useAtomValue(drawingStateAtom)
  const drawingState = Result.isSuccess(drawingResult) ? drawingResult.value : "idle"
  const isDrawing = drawingState !== "idle"
  const isClosed = drawingState === "closed"

  const framesResult = useAtomValue(framesAtom)
  const frames = framesResult._tag === "Success" ? framesResult.value : []
  const frameCount = frames.length

  const currentFrameResult = useAtomValue(currentFrameAtom) as Result.Result<number>
  const currentFrame = Result.isSuccess(currentFrameResult) ? currentFrameResult.value : 0

  const hasMask = useAtomValue(currentFrameHasMaskAtom)
  const hasPrevMask = useAtomValue(previousFrameMaskExistsAtom)

  const editMaskMode = useAtomValue(editMaskModeAtom)
  const editingTarget = useAtomValue(editingPathTargetAtom)
  const bufferDistance = useAtomValue(maskBufferDistanceAtom)
  const outerMode = useAtomValue(maskOuterModeAtom)
  const triggerSetBuffer = useAtomSet(setBufferDistanceAtom)

  const zoomResult = useAtomValue(zoomAtom)
  const zoom = Result.isSuccess(zoomResult) ? zoomResult.value : 1

  // -- Setters --
  const triggerSetFrame = useAtomSet(setCurrentFrameAtom)
  const copyFromPrev = useAtomSet(copyMaskFromPreviousAtom)
  const setZoom = useAtomSet(setZoomAtom)

  // -- Machine events --
  const send = (event: any) => canvasActor?.sendSync(event)

  const isEditing = !!activeLayer

  // ============================================================
  // State 1: New Mask mode (drawing)
  // ============================================================
  if (isEditing && isDrawing) {
    return (
      <div className={BAR_CLASS}>
        <span className="font-semibold tabular-nums">F{currentFrame + 1}</span>
        <LayerIndicator name={activeLayer.name} color={activeLayer.color} />
        <span className="text-muted-foreground">Drawing new mask</span>
        <div className="flex-1" />
        <span title={!isClosed ? "Close the path by clicking the first point" : undefined}>
          <Button
            variant={isClosed ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            disabled={!isClosed}
            onClick={() => send(CanvasEvent.CommitMask)}
            title={isClosed ? "Commit mask" : undefined}
          >
            <CheckIcon className="size-3" /> Done
          </Button>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1 text-destructive-foreground"
          onClick={() => send(CanvasEvent.DiscardMask)}
        >
          <CloseIcon className="size-3" /> Discard
        </Button>
      </div>
    )
  }

  // ============================================================
  // State 2: Edit Mask mode (editing existing mask paths)
  // ============================================================
  if (isEditing && editMaskMode && hasMask) {
    return (
      <div className={BAR_CLASS}>
        <span className="font-semibold tabular-nums">F{currentFrame + 1}</span>
        <LayerIndicator name={activeLayer.name} color={activeLayer.color} />

        <span className="text-border mx-1">|</span>

        {/* Uniform / Free toggle */}
        <Button
          variant={outerMode === "uniform" ? "secondary" : "ghost"}
          size="sm" className="h-6 px-2 text-xs"
          onClick={() => send(CanvasEvent.SetOuterMode({ mode: "uniform" }))}
        >
          Uniform
        </Button>
        <Button
          variant={outerMode === "free" ? "secondary" : "ghost"}
          size="sm" className="h-6 px-2 text-xs"
          onClick={() => send(CanvasEvent.SetOuterMode({ mode: "free" }))}
        >
          Free
        </Button>

        {/* Inner / Outer toggle — only in Free mode */}
        {outerMode === "free" && (
          <>
            <span className="text-border mx-1">|</span>
            <Button
              variant={editingTarget === "inner" ? "secondary" : "ghost"}
              size="sm" className="h-6 px-2 text-xs"
              onClick={() => send(CanvasEvent.SetEditingTarget({ target: "inner" }))}
            >
              Inner
            </Button>
            <Button
              variant={editingTarget === "outer" ? "secondary" : "ghost"}
              size="sm" className="h-6 px-2 text-xs"
              onClick={() => send(CanvasEvent.SetEditingTarget({ target: "outer" }))}
            >
              Outer
            </Button>
          </>
        )}

        {/* Buffer distance — slider + number input, visible in both modes */}
        <span className="text-border mx-1">|</span>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Buffer
          <input
            type="range"
            min="2" max="100" step="1"
            value={bufferDistance}
            onChange={(e) => triggerSetBuffer(Number(e.target.value))}
            className="w-16 h-1 accent-muted-foreground cursor-pointer"
          />
          <input
            type="number"
            min="2" max="200" step="1"
            value={bufferDistance}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!isNaN(v) && v >= 2) triggerSetBuffer(v)
            }}
            className="w-10 h-5 px-1 text-xs text-right tabular-nums bg-transparent border border-border rounded outline-none focus:border-ring"
          />
        </label>

        <div className="flex-1" />

        <Button
          variant="ghost" size="sm" className="h-6 px-2 text-xs"
          onClick={() => send(CanvasEvent.ExitEditMask)}
        >
          <ChevronLeftIcon className="size-3" /> Back
        </Button>
      </div>
    )
  }

  // ============================================================
  // State 3: Base editing (layer selected, choose action)
  // ============================================================
  if (isEditing) {
    return (
      <div className={BAR_CLASS}>
        {/* Frame navigation */}
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

        {/* Contextual actions based on mask presence */}
        {hasMask && (
          <Button
            variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => send(CanvasEvent.EnterEditMask)}
          >
            Edit Mask
          </Button>
        )}

        {!hasMask && hasPrevMask && (
          <Button
            variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => copyFromPrev(undefined)}
          >
            Copy from Previous
          </Button>
        )}

        <Button
          variant="ghost" size="sm" className="h-6 px-2 text-xs"
          onClick={() => send(CanvasEvent.StartNewMask)}
        >
          New Mask
        </Button>

        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0"
          onClick={() => send(CanvasEvent.DeselectLayer)}
          aria-label="Exit edit mode"
        >
          <CloseIcon className="size-3.5" />
        </Button>
      </div>
    )
  }

  // ============================================================
  // State 4: Viewing (no layer selected)
  // ============================================================
  return (
    <div className={BAR_CLASS}>
      <span className="tabular-nums text-muted-foreground">
        {frameCount > 0 ? `Frame ${currentFrame + 1} / ${frameCount}` : "No frames"}
      </span>
      {frameCount > 0 && <span className="text-muted-foreground/60">24fps</span>}
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

// -- Sub-components --

function LayerIndicator({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground truncate max-w-24">{name}</span>
    </div>
  )
}

// -- Icons --

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
