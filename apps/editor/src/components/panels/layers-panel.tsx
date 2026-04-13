import { Atom, Result } from "@effect-atom/atom"
import { useAtom, useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import {
  layersAtom,
  activeLayerIdAtom,
  createLayerAtom,
  deleteLayerAtom,
} from "../../lib/layer-atoms"
import { canvasActor, CanvasEvent } from "../../lib/canvas-machine"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const newLayerNameAtom = Atom.make("")

export function LayersPanel() {
  const layersResult = useAtomValue(layersAtom)
  const layers = Result.isSuccess(layersResult) ? layersResult.value : []
  const activeLayerIdResult = useAtomValue(activeLayerIdAtom)
  const activeLayerId = Result.isSuccess(activeLayerIdResult) ? activeLayerIdResult.value : null
  const createLayer = useAtomSet(createLayerAtom)
  const deleteLayer = useAtomSet(deleteLayerAtom)

  const [newLayerName, setNewLayerName] = useAtom(newLayerNameAtom)

  const handleCreate = () => {
    const trimmed = newLayerName.trim()
    if (!trimmed) return
    createLayer(trimmed)
    setNewLayerName("")
  }

  const handleSelectLayer = (layerId: string, isActive: boolean) => {
    if (isActive) {
      canvasActor?.sendSync(CanvasEvent.DeselectLayer)
    } else {
      canvasActor?.sendSync(CanvasEvent.SelectLayer({ layerId }))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layers</h2>
      </div>

      {/* Create layer */}
      <div className="flex gap-1 px-2 py-2 border-b border-border">
        <Input
          placeholder="New layer..."
          value={newLayerName}
          onChange={(e) => setNewLayerName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="h-7 text-xs"
        />
        <Button size="sm" onClick={handleCreate} className="h-7 px-2 text-xs">
          Add
        </Button>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {layers.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <p className="text-sm text-muted-foreground text-center">
              No layers yet
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {layers.map((layer) => {
              const isActive = layer.id === activeLayerId
              return (
                <div
                  key={layer.id}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                    isActive ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select layer ${layer.name}`}
                  aria-pressed={isActive}
                  onClick={() => handleSelectLayer(layer.id, isActive)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleSelectLayer(layer.id, isActive)
                    }
                  }}
                >
                  {/* Color swatch */}
                  <div
                    className="size-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: layer.color }}
                  />

                  {/* Name */}
                  <span className="text-sm truncate flex-1">{layer.name}</span>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 opacity-0 group-hover:opacity-100 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteLayer(layer.id)
                    }}
                    aria-label={`Delete layer ${layer.name}`}
                  >
                    <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
