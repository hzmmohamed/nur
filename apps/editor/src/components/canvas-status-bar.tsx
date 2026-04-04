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
