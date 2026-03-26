import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import { Stage, Layer, Rect, Text, Line } from "react-konva"
import { css } from "../../styled-system/css"

interface TimelineProps {
  frameCount: number
  currentFrame: number
  onFrameSelect: (index: number) => void
  width: number
}

const FRAME_CELL_BASE_WIDTH = 24
const TIMELINE_HEIGHT = 64
const HEADER_HEIGHT = 20

export function Timeline(props: TimelineProps) {
  const { frameCount, currentFrame, onFrameSelect, width } = props
  const [zoomLevel, setZoomLevel] = useState(1)
  const [isScrubbing, setIsScrubbing] = useState(false)
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
    [frameCount, onFrameSelect, positionToFrame]
  )

  // Global mouse events for scrubbing
  useEffect(() => {
    if (!isScrubbing) return

    const handleMouseMove = (e: MouseEvent) => {
      onFrameSelect(positionToFrame(e.clientX))
    }
    const handleMouseUp = () => setIsScrubbing(false)

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isScrubbing, onFrameSelect, positionToFrame])

  // Ctrl + scroll wheel zoom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        setZoomLevel((prev) => {
          const next = e.deltaY < 0
            ? Math.min(5, prev + 0.1)
            : Math.max(0.5, prev - 0.1)
          return parseFloat(next.toFixed(1))
        })
      }
    }
    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [])

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
      <div className={css({
        display: "flex", alignItems: "center", px: "4", py: "2",
        borderTop: "1px solid", borderColor: "border.default", minH: "16", bg: "bg.default",
      })}>
        <p className={css({ color: "fg.muted", fontSize: "sm" })}>No frames imported</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={css({
        borderTop: "1px solid", borderColor: "border.default",
        overflowX: "auto", overflowY: "hidden", cursor: "ew-resize", bg: "bg.default",
      })}
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
