import { useRef, useCallback } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtom, useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import { appRegistry } from "../lib/atom-registry"
import { layersAtom, activeLayerIdAtom, setActiveLayerIdAtom } from "../lib/layer-atoms"
import { tokens } from "@/tokens"

interface TimelineProps {
  frameCount: number
  currentFrame: number
  onFrameSelect: (index: number) => void
}

const CELL_W = tokens.timeline.cellBaseWidth
const HEADER_H = tokens.timeline.headerHeight
const ROW_H = 28
const LABEL_W = 160

const zoomLevelAtom = Atom.make(1)
const isScrubbingAtom = Atom.make(false)

// -- Scrubbing --

let scrubbingCallback: ((clientX: number) => void) | null = null

function onScrubbingMouseMove(e: MouseEvent) {
  scrubbingCallback?.(e.clientX)
}
function onScrubbingMouseUp() {
  appRegistry.set(isScrubbingAtom, false)
  document.removeEventListener("mousemove", onScrubbingMouseMove)
  document.removeEventListener("mouseup", onScrubbingMouseUp)
}

appRegistry.subscribe(isScrubbingAtom, (scrubbing) => {
  if (scrubbing) {
    document.addEventListener("mousemove", onScrubbingMouseMove)
    document.addEventListener("mouseup", onScrubbingMouseUp)
  }
})

// -- Component --

export function Timeline({ frameCount, currentFrame, onFrameSelect }: TimelineProps) {
  const [zoomLevel] = useAtom(zoomLevelAtom)
  const layersResult = useAtomValue(layersAtom)
  const layers = Result.isSuccess(layersResult) ? layersResult.value : []
  const activeLayerIdResult = useAtomValue(activeLayerIdAtom)
  const activeLayerId = Result.isSuccess(activeLayerIdResult) ? activeLayerIdResult.value : null
  const setActiveLayerId = useAtomSet(setActiveLayerIdAtom)

  const gridRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  const cellW = CELL_W * zoomLevel
  const gridWidth = Math.max(frameCount * cellW, 200)
  const bodyHeight = Math.max(layers.length * ROW_H, ROW_H)

  // -- Scrubbing helpers --

  const positionToFrame = useCallback(
    (clientX: number): number => {
      if (!gridRef.current) return 0
      const rect = gridRef.current.getBoundingClientRect()
      const x = clientX - rect.left + gridRef.current.scrollLeft
      return Math.max(0, Math.min(Math.floor(x / cellW), frameCount - 1))
    },
    [cellW, frameCount],
  )

  const positionToLayerIndex = useCallback(
    (clientY: number): number => {
      if (!gridRef.current) return -1
      const rect = gridRef.current.getBoundingClientRect()
      const y = clientY - rect.top + gridRef.current.scrollTop - HEADER_H
      if (y < 0) return -1
      const idx = Math.floor(y / ROW_H)
      return idx >= 0 && idx < layers.length ? idx : -1
    },
    [layers.length],
  )

  scrubbingCallback = (clientX: number) => {
    onFrameSelect(positionToFrame(clientX))
  }

  const handleGridMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || frameCount === 0) return
      e.preventDefault()
      appRegistry.set(isScrubbingAtom, true)
      onFrameSelect(positionToFrame(e.clientX))

      // Also select the layer row that was clicked
      const layerIdx = positionToLayerIndex(e.clientY)
      if (layerIdx >= 0 && layers[layerIdx]) {
        setActiveLayerId(layers[layerIdx].id)
      }
    },
    [frameCount, onFrameSelect, positionToFrame, positionToLayerIndex, layers, setActiveLayerId],
  )

  // Sync vertical scroll between label panel and grid
  const handleGridScroll = useCallback(() => {
    if (gridRef.current && labelRef.current) {
      labelRef.current.scrollTop = gridRef.current.scrollTop
    }
  }, [])

  // Zoom with ctrl+scroll
  const gridRefCallback = useCallback((el: HTMLDivElement | null) => {
    ;(gridRef as any).current = el
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const prev = appRegistry.get(zoomLevelAtom)
        const next = e.deltaY < 0
          ? Math.min(5, prev + 0.1)
          : Math.max(0.5, prev - 0.1)
        appRegistry.set(zoomLevelAtom, parseFloat(next.toFixed(1)))
      }
    }
    el.addEventListener("wheel", handleWheel, { passive: false })
  }, [])

  if (frameCount === 0 && layers.length === 0) {
    return (
      <div className="flex items-center px-4 py-2 min-h-16 bg-background">
        <p className="text-muted-foreground text-sm">No frames imported</p>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-background">
      {/* Left: layer labels */}
      <div
        ref={labelRef}
        className="flex-shrink-0 overflow-hidden border-r border-border"
        style={{ width: LABEL_W }}
      >
        {/* Header spacer */}
        <div
          className="flex items-center px-2 border-b border-border text-xs text-muted-foreground font-semibold"
          style={{ height: HEADER_H }}
        >
          Layers
        </div>

        {/* Layer rows */}
        <div className="overflow-y-hidden" style={{ height: `calc(100% - ${HEADER_H}px)` }}>
          {layers.length === 0 ? (
            <div className="flex items-center px-2 text-xs text-muted-foreground" style={{ height: ROW_H }}>
              No layers
            </div>
          ) : (
            layers.map((layer) => {
              const isActive = layer.id === activeLayerId
              return (
                <div
                  key={layer.id}
                  className={`flex items-center gap-2 px-2 cursor-pointer transition-colors truncate ${
                    isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  }`}
                  style={{ height: ROW_H }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveLayerId(isActive ? null : layer.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setActiveLayerId(isActive ? null : layer.id)
                    }
                  }}
                >
                  <div
                    className="size-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: layer.color }}
                  />
                  <span className="text-xs truncate">{layer.name}</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right: frame grid */}
      <div
        ref={gridRefCallback}
        className="flex-1 overflow-auto cursor-ew-resize"
        onMouseDown={handleGridMouseDown}
        onScroll={handleGridScroll}
      >
        <svg
          width={gridWidth}
          height={HEADER_H + bodyHeight}
          className="block"
        >
          {/* Background */}
          <rect
            x={0} y={0}
            width={gridWidth} height={HEADER_H + bodyHeight}
            fill={tokens.color.timeline.bg}
          />

          {/* Frame number header */}
          {Array.from({ length: frameCount }, (_, i) => {
            const x = i * cellW
            const showLabel = zoomLevel >= 1 || (zoomLevel >= 0.5 ? (i + 1) % 5 === 0 || i === 0 : (i + 1) % 10 === 0 || i === 0)
            return showLabel ? (
              <text
                key={`h-${i}`}
                x={x + cellW / 2}
                y={HEADER_H - 4}
                textAnchor="middle"
                fill={tokens.color.timeline.label}
                fontSize={tokens.timeline.labelFontSize}
              >
                {i + 1}
              </text>
            ) : null
          })}

          {/* Header separator */}
          <line
            x1={0} y1={HEADER_H}
            x2={gridWidth} y2={HEADER_H}
            stroke={tokens.color.timeline.grid}
            strokeWidth={1}
          />

          {/* Grid lines (vertical) */}
          {Array.from({ length: frameCount + 1 }, (_, i) => (
            <line
              key={`v-${i}`}
              x1={i * cellW} y1={HEADER_H}
              x2={i * cellW} y2={HEADER_H + bodyHeight}
              stroke={tokens.color.timeline.grid}
              strokeWidth={1}
            />
          ))}

          {/* Grid lines (horizontal, per layer) */}
          {layers.map((_, i) => (
            <line
              key={`h-${i}`}
              x1={0} y1={HEADER_H + (i + 1) * ROW_H}
              x2={gridWidth} y2={HEADER_H + (i + 1) * ROW_H}
              stroke={tokens.color.timeline.grid}
              strokeWidth={1}
            />
          ))}

          {/* Mask indicators — TODO: map frameId to index to show dots */}

          {/* Active frame highlight column */}
          {currentFrame >= 0 && currentFrame < frameCount && (
            <rect
              x={currentFrame * cellW}
              y={HEADER_H}
              width={cellW}
              height={bodyHeight}
              fill={tokens.color.timeline.activeBg}
            />
          )}

          {/* Active layer highlight row */}
          {activeLayerId && (() => {
            const layerIdx = layers.findIndex((l) => l.id === activeLayerId)
            if (layerIdx < 0) return null
            return (
              <rect
                x={0}
                y={HEADER_H + layerIdx * ROW_H}
                width={gridWidth}
                height={ROW_H}
                fill={tokens.color.timeline.activeBg}
              />
            )
          })()}

          {/* Playhead */}
          {currentFrame >= 0 && currentFrame < frameCount && (
            <rect
              x={currentFrame * cellW}
              y={0}
              width={tokens.timeline.playheadWidth}
              height={HEADER_H + bodyHeight}
              fill={tokens.color.timeline.playhead}
            />
          )}
        </svg>
      </div>
    </div>
  )
}
