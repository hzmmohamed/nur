import { useRef, useCallback, useMemo } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtom, useAtomMount } from "@effect-atom/atom-react/Hooks"
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

export function Timeline(props: TimelineProps) {
  const { frameCount, currentFrame, onFrameSelect, width } = props
  const [zoomLevel, setZoomLevel] = useAtom(zoomLevelAtom)
  const [isScrubbing, setIsScrubbing] = useAtom(isScrubbingAtom)
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

  // Mouse down on stage
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || frameCount === 0) return
      e.preventDefault()
      setIsScrubbing(true)
      onFrameSelect(positionToFrame(e.clientX))
    },
    [frameCount, onFrameSelect, positionToFrame, setIsScrubbing]
  )

  // Global mouse events for scrubbing
  const scrubbingListenerAtom = useMemo(() =>
    Atom.make((get) => {
      const scrubbing = get(isScrubbingAtom)
      if (!scrubbing) return

      const handleMouseMove = (e: MouseEvent) => {
        onFrameSelect(positionToFrame(e.clientX))
      }
      const handleMouseUp = () => get.set(isScrubbingAtom, false)

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      get.addFinalizer(() => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      })
    }),
    [onFrameSelect, positionToFrame],
  )
  useAtomMount(scrubbingListenerAtom)

  // Ctrl + scroll wheel zoom
  const wheelZoomAtom = useMemo(() =>
    Atom.make((get) => {
      const container = containerRef.current
      if (!container) return

      const handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
          e.preventDefault()
          const prev = get.once(zoomLevelAtom)
          const next = e.deltaY < 0
            ? Math.min(5, prev + 0.1)
            : Math.max(0.5, prev - 0.1)
          get.set(zoomLevelAtom, parseFloat(next.toFixed(1)))
        }
      }
      container.addEventListener("wheel", handleWheel, { passive: false })
      get.addFinalizer(() => container.removeEventListener("wheel", handleWheel))
    }),
    [],
  )
  useAtomMount(wheelZoomAtom)

  // Render frame cells
  const frameCells = useMemo(() => {
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
  }, [frameCount, currentFrame, cellWidth, zoomLevel])

  if (frameCount === 0) {
    return (
      <div className="flex items-center px-4 py-2 border-t border-border min-h-16 bg-background">
        <p className="text-muted-foreground text-sm">No frames imported</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
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
