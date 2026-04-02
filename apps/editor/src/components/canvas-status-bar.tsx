import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import { isEditModeAtom, activeLayerAtom } from "../lib/layer-atoms"
import { activeToolAtom } from "../lib/path-atoms"
import { zoomAtom, setZoomAtom } from "../lib/viewport-atoms"
import { Button } from "@/components/ui/button"

export function CanvasStatusBar() {
  const isEditMode = useAtomValue(isEditModeAtom)
  const zoomResult = useAtomValue(zoomAtom)
  const zoom = Result.isSuccess(zoomResult) ? zoomResult.value : 1
  const setZoom = useAtomSet(setZoomAtom)

  return (
    <div className="flex items-center gap-2 px-3 py-0.5 bg-background/80 backdrop-blur-sm border-t border-border text-xs text-muted-foreground">
      {/* Left: contextual info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isEditMode ? <EditModeStatus /> : <PreviewModeStatus />}
      </div>

      {/* Right: zoom */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-xs text-muted-foreground"
          onClick={() => setZoom(1)}
        >
          Fit
        </Button>
        <span className="tabular-nums w-10 text-right">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  )
}

function PreviewModeStatus() {
  return (
    <span className="truncate">
      Select a layer to start editing
    </span>
  )
}

function EditModeStatus() {
  const activeLayerResult = useAtomValue(activeLayerAtom)
  const activeLayer = Result.isSuccess(activeLayerResult) ? activeLayerResult.value : null
  const toolResult = useAtomValue(activeToolAtom)
  const activeTool = Result.isSuccess(toolResult) ? toolResult.value : "select"

  if (!activeLayer) return null

  const hint = activeTool === "pen"
    ? "Click to add point · Close path to create mask"
    : "Click a point to select · Drag to move"

  return (
    <span className="truncate">{hint}</span>
  )
}
