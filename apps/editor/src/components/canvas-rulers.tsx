import { Result } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { zoomRawAtom } from "../lib/viewport-atoms"
import { stagePositionAtom, stageSizeAtom } from "./canvas-minimap"
import { framesAtom, currentFrameAtom } from "../lib/project-doc-atoms"
import { rulerProjectionsAtom } from "../lib/layer-atoms"

const RULER_SIZE = 20       // px, screen-space thickness
const SPAN_HEIGHT = 6       // px, height of projection span bar
const SPAN_OPACITY = 0.55
const LABEL_SIZE = 9        // font-size px

function tickInterval(zoom: number): { major: number; minor: number } {
  if (zoom < 0.3) return { major: 500, minor: 100 }
  if (zoom < 0.6) return { major: 200, minor: 50 }
  if (zoom < 1.2) return { major: 100, minor: 20 }
  if (zoom < 2.5) return { major: 50, minor: 10 }
  return { major: 20, minor: 5 }
}

interface Projection { color: string; min: number; max: number }

interface RulerProps {
  axis: "x" | "y"
  frameSize: number
  zoom: number
  projections: Projection[]
}

function Ruler({ axis, frameSize, zoom, projections }: RulerProps) {
  const { major, minor } = tickInterval(zoom)
  const ticks: { pos: number; isMajor: boolean }[] = []
  for (let px = 0; px <= frameSize; px += minor) {
    ticks.push({ pos: px, isMajor: px % major === 0 })
  }

  const isX = axis === "x"
  // frame px → screen px within this ruler div (frameOffset is 0 since the div is already positioned at the frame edge)
  const toScreen = (px: number) => px * zoom

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* Background */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,20,20,0.72)" }} />

      {/* Projection spans */}
      {projections.map((proj, i) => {
        const start = toScreen(proj.min)
        const size = (proj.max - proj.min) * zoom
        if (size <= 0) return null
        const spanOffset = (RULER_SIZE - SPAN_HEIGHT) / 2
        return (
          <div key={i} style={{
            position: "absolute",
            background: proj.color,
            opacity: SPAN_OPACITY,
            ...(isX
              ? { left: start, width: size, top: spanOffset, height: SPAN_HEIGHT }
              : { top: start, height: size, left: spanOffset, width: SPAN_HEIGHT }),
          }} />
        )
      })}

      {/* Ticks + labels */}
      {ticks.map(({ pos, isMajor }) => {
        const screen = toScreen(pos)
        const tickLen = isMajor ? RULER_SIZE * 0.55 : RULER_SIZE * 0.28
        const color = isMajor ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)"
        if (isX) {
          return (
            <div key={pos} style={{ position: "absolute", left: screen, top: RULER_SIZE - tickLen, width: 1, height: tickLen, background: color }}>
              {isMajor && pos > 0 && (
                <span style={{ position: "absolute", bottom: tickLen + 1, left: 2, fontSize: LABEL_SIZE, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", lineHeight: 1 }}>
                  {pos}
                </span>
              )}
            </div>
          )
        } else {
          return (
            <div key={pos} style={{ position: "absolute", top: screen, left: RULER_SIZE - tickLen, height: 1, width: tickLen, background: color }}>
              {isMajor && pos > 0 && (
                <span style={{
                  position: "absolute",
                  right: tickLen + 1,
                  top: 0,
                  fontSize: LABEL_SIZE,
                  color: "rgba(255,255,255,0.75)",
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                  transform: "rotate(-90deg) translateX(50%)",
                  transformOrigin: "right top",
                }}>
                  {pos}
                </span>
              )}
            </div>
          )
        }
      })}
    </div>
  )
}

export function CanvasRulers() {
  const zoom = useAtomValue(zoomRawAtom)
  const stagePos = useAtomValue(stagePositionAtom)
  const stageSize = useAtomValue(stageSizeAtom)
  const framesResult = useAtomValue(framesAtom)
  const currentFrameResult = useAtomValue(currentFrameAtom)
  const projections = useAtomValue(rulerProjectionsAtom)

  const frames = Result.isSuccess(framesResult) ? framesResult.value : []
  const currentIdx = Result.isSuccess(currentFrameResult) ? currentFrameResult.value : 0
  const frame = frames.find((f) => f.index === currentIdx)

  if (!frame) return null

  const frameW = frame.width
  const frameH = frame.height

  // Compute where the frame image appears in screen space
  const baseScale = Math.min(stageSize.w / frameW, stageSize.h / frameH)
  const scaledW = frameW * baseScale
  const scaledH = frameH * baseScale
  const stageFrameX = (stageSize.w - scaledW) / 2
  const stageFrameY = (stageSize.h - scaledH) / 2
  const screenFrameX = stageFrameX * zoom + stagePos.x
  const screenFrameY = stageFrameY * zoom + stagePos.y

  const xProj: Projection[] = projections.map((p) => ({ color: p.color, min: p.xMin, max: p.xMax }))
  const yProj: Projection[] = projections.map((p) => ({ color: p.color, min: p.yMin, max: p.yMax }))

  return (
    <>
      {/* X ruler — anchored to top of canvas, horizontally aligned with frame */}
      <div style={{
        position: "absolute",
        top: 0,
        left: screenFrameX,
        width: frameW * zoom,
        height: RULER_SIZE,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 10,
      }}>
        <Ruler axis="x" frameSize={frameW} zoom={zoom} projections={xProj} />
      </div>

      {/* Y ruler — anchored to left of canvas, vertically aligned with frame */}
      <div style={{
        position: "absolute",
        top: screenFrameY,
        left: 0,
        width: RULER_SIZE,
        height: frameH * zoom,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 10,
      }}>
        <Ruler axis="y" frameSize={frameH} zoom={zoom} projections={yProj} />
      </div>
    </>
  )
}
