import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import {
  activeLayerAtom,
  setActiveLayerIdAtom,
} from "../lib/layer-atoms"
import {
  activeToolAtom,
  setActiveToolAtom,
  drawingStateAtom,
  setDrawingStateAtom,
} from "../lib/path-atoms"
import { currentFrameAtom } from "../lib/project-doc-atoms"
import { Button } from "@/components/ui/button"

export function CanvasBar() {
  const activeLayerResult = useAtomValue(activeLayerAtom)
  const activeLayer = Result.isSuccess(activeLayerResult) ? activeLayerResult.value : null
  const currentFrameResult = useAtomValue(currentFrameAtom) as Result.Result<number>
  const currentFrame = Result.isSuccess(currentFrameResult) ? currentFrameResult.value : 0
  const setActiveLayerId = useAtomSet(setActiveLayerIdAtom)
  const toolResult = useAtomValue(activeToolAtom)
  const activeTool = Result.isSuccess(toolResult) ? toolResult.value : "select"
  const setTool = useAtomSet(setActiveToolAtom)
  const drawingResult = useAtomValue(drawingStateAtom)
  const drawingState = Result.isSuccess(drawingResult) ? drawingResult.value : "idle"
  const setDrawingState = useAtomSet(setDrawingStateAtom)

  const isDrawing = drawingState !== "idle"
  const isClosed = drawingState === "closed"

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-background/80 backdrop-blur-sm border-b border-border">
      {activeLayer && (
        <>
          {/* Frame number */}
          <span className="text-sm font-semibold tabular-nums">
            F{currentFrame + 1}
          </span>

          {/* Layer color + name */}
          <div className="flex items-center gap-1.5">
            <div
              className="size-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: activeLayer.color }}
            />
            <span className="text-xs text-muted-foreground truncate max-w-24">
              {activeLayer.name}
            </span>
          </div>

          <div className="flex-1" />

          {isDrawing ? (
            /* New Mask mode: Done + Discard */
            <div className="flex items-center gap-1">
              <Button
                variant={isClosed ? "default" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                disabled={!isClosed}
                onClick={() => {
                  setDrawingState("idle")
                  setTool("select")
                }}
                title={isClosed ? "Commit mask" : "Close the path by clicking the first point"}
              >
                <CheckIcon className="size-3" />
                Done
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1 text-destructive-foreground"
                onClick={() => {
                  // TODO: delete incomplete path from Y.Doc
                  setDrawingState("idle")
                  setTool("select")
                }}
                title="Discard this path"
              >
                <CloseIcon className="size-3" />
                Discard
              </Button>
            </div>
          ) : (
            /* Edit mode: sub-tool buttons + close */
            <div className="flex items-center gap-1">
              <Button
                variant={activeTool === "select" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setTool("select")}
              >
                Edit Mask
              </Button>
              <Button
                variant={activeTool === "pen" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setTool("pen")
                  setDrawingState("drawing")
                }}
              >
                New Mask
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setActiveLayerId(null)}
                aria-label="Exit edit mode"
              >
                <CloseIcon className="size-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
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
