import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import {
  activeLayerAtom,
  layersAtom,
  setActiveLayerIdAtom,
  isEditModeAtom,
} from "../lib/layer-atoms"
import { currentFrameAtom } from "../lib/project-doc-atoms"
import { Button } from "@/components/ui/button"

export function ScopeBar() {
  const isEditMode = useAtomValue(isEditModeAtom)

  if (!isEditMode) return null

  return <ScopeBarContent />
}

function ScopeBarContent() {
  const activeLayerResult = useAtomValue(activeLayerAtom)
  const activeLayer = Result.isSuccess(activeLayerResult) ? activeLayerResult.value : null
  const layersResult = useAtomValue(layersAtom)
  const layers = Result.isSuccess(layersResult) ? layersResult.value : []
  const currentFrameResult = useAtomValue(currentFrameAtom) as Result.Result<number>
  const currentFrame = Result.isSuccess(currentFrameResult) ? currentFrameResult.value : 0
  const setActiveLayerId = useAtomSet(setActiveLayerIdAtom)

  if (!activeLayer) return null

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-background text-sm">
      {/* Layer dropdown */}
      <div className="relative">
        <select
          value={activeLayer.id}
          onChange={(e) => setActiveLayerId(e.target.value)}
          className="appearance-none bg-transparent border border-border rounded-md px-2 py-0.5 pr-6 text-sm text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
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
        className="size-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: activeLayer.color }}
        aria-label={`Layer color: ${activeLayer.color}`}
      />

      {/* Context */}
      <span className="text-muted-foreground">
        {activeLayer.name}
        <span className="mx-1.5 text-border">/</span>
        Frame {currentFrame + 1}
      </span>

      <div className="flex-1" />

      {/* Close (exit Edit mode) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setActiveLayerId(null)}
        aria-label="Exit edit mode"
        className="h-6 px-1.5"
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
