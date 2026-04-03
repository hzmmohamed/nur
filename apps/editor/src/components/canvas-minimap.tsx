import { Result, Atom } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { zoomAtom } from "../lib/viewport-atoms"
import { tokens } from "@/tokens"

/**
 * Stage position atom — updated by canvas-atom on pan/zoom.
 * This is a simple writable atom that the canvas imperatively sets.
 */
export const stagePositionAtom = Atom.make({ x: 0, y: 0 })
export const stageSizeAtom = Atom.make({ w: 800, h: 600 })

const MINIMAP_W = 140
const MINIMAP_H = 90

export function CanvasMinimap() {
  const zoomResult = useAtomValue(zoomAtom)
  const zoom = Result.isSuccess(zoomResult) ? zoomResult.value : 1
  const stagePos = useAtomValue(stagePositionAtom)
  const stageSize = useAtomValue(stageSizeAtom)

  if (zoom <= 1.05) return null

  const containerW = stageSize.w
  const containerH = stageSize.h
  const scale = Math.min(MINIMAP_W / containerW, MINIMAP_H / containerH)
  const mapW = containerW * scale
  const mapH = containerH * scale

  // Viewport rectangle in minimap coords
  const vpW = (containerW / zoom) * scale
  const vpH = (containerH / zoom) * scale
  const vpX = (-stagePos.x / zoom) * scale
  const vpY = (-stagePos.y / zoom) * scale

  return (
    <div className="absolute bottom-10 right-3 rounded border border-border bg-background/80 backdrop-blur-sm pointer-events-none">
      <svg width={mapW} height={mapH}>
        {/* Frame area */}
        <rect
          x={0} y={0}
          width={mapW} height={mapH}
          fill={tokens.color.neutral[900]}
        />
        {/* Viewport indicator */}
        <rect
          x={vpX} y={vpY}
          width={vpW} height={vpH}
          fill="none"
          stroke={tokens.color.timeline.playhead}
          strokeWidth={1.5}
          rx={1}
        />
      </svg>
    </div>
  )
}
