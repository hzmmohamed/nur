import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import {
  activeLayerAtom,
  setActiveLayerIdAtom,
} from "../lib/layer-atoms"
import { activeToolAtom, setActiveToolAtom } from "../lib/path-atoms"
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

  // TODO: compute actual mask count from layer.masks[currentFrameId]
  const maskCount = 0

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-background/80 backdrop-blur-sm border-b border-border">
      {activeLayer ? (
        <>
          {/* Frame number — highest priority */}
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

          {/* Mask count */}
          <span className="text-xs text-muted-foreground tabular-nums">
            {maskCount === 0 ? "No masks" : `${maskCount} mask${maskCount > 1 ? "s" : ""}`}
          </span>
        </>
      ) : null}

      {activeLayer && (
        <>
          <div className="flex-1" />

          {/* Tools */}
          <div className="flex items-center gap-0.5">
            <Button
              variant={activeTool === "select" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setTool("select")}
              aria-label="Select tool (V)"
              aria-pressed={activeTool === "select"}
            >
              <CursorIcon className="size-3.5" />
            </Button>
            <Button
              variant={activeTool === "pen" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setTool("pen")}
              aria-label="Pen tool (P)"
              aria-pressed={activeTool === "pen"}
            >
              <PenIcon className="size-3.5" />
            </Button>
          </div>

          {/* Close */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setActiveLayerId(null)}
            aria-label="Exit edit mode"
          >
            <CloseIcon className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  )
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
    </svg>
  )
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
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
