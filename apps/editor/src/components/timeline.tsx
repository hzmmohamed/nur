import { useRef, useCallback } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtom } from "@effect-atom/atom-react/Hooks"
import { appRegistry } from "../lib/atom-registry"
import { Stage, Layer, Rect, Text, Line } from "react-konva"

interface TimelineProps {
  frameCount: number
  currentFrame: number
  onFrameSelect: (index: number) => void
  width: number
}

const FRAME_CELL_BASE_WIDTH = 24
const TIMELINE_HEIGHT = 64
const HEADER_HEIGHT = 20

const zoomLevelAtom = Atom.make(1)
const isScrubbingAtom = Atom.make(false)

// -- Module-scope scrubbing listener (reads isScrubbingAtom, calls stored callback) --

let scrubbingCallback: ((clientX: number) => void) | null = null

function onScrubbingMouseMove(e: MouseEvent) {
  scrubbingCallback?.(e.clientX)
}
function onScrubbingMouseUp() {
  appRegistry.set(isScrubbingAtom, false)
  document.removeEventListener("mousemove", onScrubbingMouseMove)
  document.removeEventListener("mouseup", onScrubbingMouseUp)
}

// Subscribe to isScrubbingAtom — when true, attach global listeners
appRegistry.subscribe(isScrubbingAtom, (scrubbing) => {
  if (scrubbing) {
    document.addEventListener("mousemove", onScrubbingMouseMove)
    document.addEventListener("mouseup", onScrubbingMouseUp)
  }
})

function renderFrameCells(
  frameCount: number,
  currentFrame: number,
  cellWidth: number,
  zoomLevel: number,
) {
  const cells: Array<React.ReactElement> = []
  const labelInterval = zoomLevel >= 1 ? 1 : zoomLevel >= 0.5 ? 5 : 10

  for (let i = 0; i < frameCount; i++) {
    const x = i * cellWidth
    const isActive = i === currentFrame

    if (isActive) {
      cells.push(
        <Rect key={`bg-${i}`} x={x} y={HEADER_HEIGHT} width={cellWidth}
          height={TIMELINE_HEIGHT - HEADER_HEIGHT} fill="rgba(59, 130, 246, 0.3)" />
      )
    }

    cells.push(
      <Line key={`border-${i}`} points={[x, HEADER_HEIGHT, x, TIMELINE_HEIGHT]}
        stroke="#3f3f46" strokeWidth={1} />
    )

    if ((i + 1) % labelInterval === 0 || i === 0) {
      cells.push(
        <Text key={`label-${i}`} x={x} y={4} width={cellWidth}
          text={`${i + 1}`} fontSize={10} fill="#a1a1aa" align="center" />
      )
    }

    if (i > 0 && i % 10 === 0) {
      cells.push(
        <Rect key={`marker-${i}`} x={x} y={HEADER_HEIGHT}
          width={1} height={TIMELINE_HEIGHT - HEADER_HEIGHT} fill="#71717a" />
      )
    }
  }

  if (currentFrame >= 0 && currentFrame < frameCount) {
    cells.push(
      <Rect key="playhead" x={currentFrame * cellWidth} y={0}
        width={2} height={TIMELINE_HEIGHT} fill="#3b82f6" />
    )
  }

  return cells
}

export function Timeline(props: TimelineProps) {
  const { frameCount, currentFrame, onFrameSelect, width } = props
  const [zoomLevel] = useAtom(zoomLevelAtom)
  const containerRef = useRef<HTMLDivElement>(null)

  const cellWidth = FRAME_CELL_BASE_WIDTH * zoomLevel
  const totalWidth = Math.max(frameCount * cellWidth, width)

  const positionToFrame = useCallback(
    (clientX: number): number => {
      if (!containerRef.current) return 0
      const rect = containerRef.current.getBoundingClientRect()
      const x = clientX - rect.left + containerRef.current.scrollLeft
      const frame = Math.floor(x / cellWidth)
      return Math.max(0, Math.min(frame, frameCount - 1))
    },
    [cellWidth, frameCount]
  )

  // Keep the scrubbing callback up to date with current props
  scrubbingCallback = (clientX: number) => {
    onFrameSelect(positionToFrame(clientX))
  }

  // Mouse down on stage
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || frameCount === 0) return
      e.preventDefault()
      appRegistry.set(isScrubbingAtom, true)
      onFrameSelect(positionToFrame(e.clientX))
    },
    [frameCount, onFrameSelect, positionToFrame]
  )

  // Ctrl + scroll wheel zoom via ref callback
  const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
    (containerRef as any).current = el
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
    return () => el.removeEventListener("wheel", handleWheel)
  }, [])

  // Render frame cells
  const frameCells = renderFrameCells(frameCount, currentFrame, cellWidth, zoomLevel)

  if (frameCount === 0) {
    return (
      <div className="flex items-center px-4 py-2 border-t border-border min-h-16 bg-background">
        <p className="text-muted-foreground text-sm">No frames imported</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRefCallback}
      className="border-t border-border overflow-x-auto overflow-y-hidden cursor-ew-resize bg-background"
      onMouseDown={handleMouseDown}
    >
      <Stage width={totalWidth} height={TIMELINE_HEIGHT}>
        <Layer>
          <Rect x={0} y={0} width={totalWidth} height={TIMELINE_HEIGHT} fill="#18181b" />
          {frameCells}
        </Layer>
      </Stage>
    </div>
  )
}
