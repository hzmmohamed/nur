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

const BAR_CLASS = "flex items-center gap-2 px-3 py-1 bg-background/80 backdrop-blur-sm border-b border-border text-xs min-h-8"

export function CanvasBar() {
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

  const setActiveLayerId = useAtomSet(setActiveLayerIdAtom)
  const setTool = useAtomSet(setActiveToolAtom)
  const setDrawingState = useAtomSet(setDrawingStateAtom)
  const triggerSetFrame = useAtomSet(setCurrentFrameAtom)
  const copyFromPrev = useAtomSet(copyMaskFromPreviousAtom)
  const setZoom = useAtomSet(setZoomAtom)

  const isEditing = !!activeLayer

  // -- Drawing state --
  if (isEditing && isDrawing) {
    return (
      <div className={BAR_CLASS}>
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
      <div className={BAR_CLASS}>
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
