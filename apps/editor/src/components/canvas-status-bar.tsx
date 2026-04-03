import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import { isEditModeAtom } from "../lib/layer-atoms"
import { drawingStateAtom } from "../lib/path-atoms"
import { zoomAtom, setZoomAtom, resetViewSignalAtom } from "../lib/viewport-atoms"
import { appRegistry } from "../lib/atom-registry"
import { Button } from "@/components/ui/button"

export function CanvasStatusBar() {
  const isEditMode = useAtomValue(isEditModeAtom)
  const drawingResult = useAtomValue(drawingStateAtom)
  const drawingState = Result.isSuccess(drawingResult) ? drawingResult.value : "idle"
  const zoomResult = useAtomValue(zoomAtom)
  const zoom = Result.isSuccess(zoomResult) ? zoomResult.value : 1
  const setZoom = useAtomSet(setZoomAtom)

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
    <div className="flex items-center gap-2 px-3 py-0.5 bg-background/80 backdrop-blur-sm border-t border-border text-xs text-muted-foreground">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="truncate">{hint}</span>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-xs text-muted-foreground"
          onClick={() => {
            setZoom(1)
            appRegistry.set(resetViewSignalAtom, (appRegistry.get(resetViewSignalAtom) as number) + 1)
          }}
        >
          Fit
        </Button>
        <span className="tabular-nums w-10 text-right">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  )
}
