import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import {
  activeLayerAtom,
  layersAtom,
  setActiveLayerIdAtom,
} from "../lib/layer-atoms"
import { activeToolAtom, setActiveToolAtom } from "../lib/path-atoms"
import { currentFrameAtom, framesAtom } from "../lib/project-doc-atoms"
import { Button } from "@/components/ui/button"

export function ScopeBar() {
  const activeLayerResult = useAtomValue(activeLayerAtom)
  const activeLayer = Result.isSuccess(activeLayerResult) ? activeLayerResult.value : null
  const layersResult = useAtomValue(layersAtom)
  const layers = Result.isSuccess(layersResult) ? layersResult.value : []
  const currentFrameResult = useAtomValue(currentFrameAtom) as Result.Result<number>
  const currentFrame = Result.isSuccess(currentFrameResult) ? currentFrameResult.value : 0
  const framesResult = useAtomValue(framesAtom) as Result.Result<Array<{ index: number }>>
  const frameCount = Result.isSuccess(framesResult) ? framesResult.value.length : 0
  const setActiveLayerId = useAtomSet(setActiveLayerIdAtom)
  const toolResult = useAtomValue(activeToolAtom)
  const activeTool = Result.isSuccess(toolResult) ? toolResult.value : "select"
  const setTool = useAtomSet(setActiveToolAtom)

  if (!activeLayer) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-background/80 backdrop-blur-sm border-b border-border text-sm">
      {/* Layer dropdown */}
      <div className="relative">
        <select
          value={activeLayer.id}
          onChange={(e) => setActiveLayerId(e.target.value)}
          className="appearance-none bg-transparent border border-border rounded-md px-2 py-0.5 pr-6 text-xs text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
      </div>

      {/* Color indicator */}
      <div
        className="size-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: activeLayer.color }}
      />

      {/* Frame context */}
      <span className="text-xs text-muted-foreground">
        Frame {currentFrame + 1} / {frameCount}
      </span>

      <div className="flex-1" />

      {/* Editing tools */}
      <div className="flex items-center gap-0.5" role="toolbar" aria-label="Editing tools">
        <Button
          variant={activeTool === "select" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setTool("select")}
          aria-label="Select tool (V)"
          aria-pressed={activeTool === "select"}
        >
          Select
        </Button>
        <Button
          variant={activeTool === "pen" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setTool("pen")}
          aria-label="Pen tool (P)"
          aria-pressed={activeTool === "pen"}
        >
          Pen
        </Button>
      </div>

      {/* Close (exit Edit mode) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setActiveLayerId(null)}
        aria-label="Exit edit mode"
        className="h-6 px-1"
      >
        <CloseIcon className="size-3.5" />
      </Button>
    </div>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
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
