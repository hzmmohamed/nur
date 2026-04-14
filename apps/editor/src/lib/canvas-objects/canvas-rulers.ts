// apps/editor/src/lib/canvas-objects/canvas-rulers.ts
import Konva from "konva"

export interface LayerProjection {
  color: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface RulerDrawOptions {
  layer: Konva.Layer
  frameWidth: number
  frameHeight: number
  /** image offset in stage coords (where frame top-left is on screen) */
  frameOffsetX: number
  frameOffsetY: number
  zoom: number
  /** per-layer bounding box projections in frame pixel coords */
  projections: LayerProjection[]
}

const RULER_THICKNESS = 20   // screen pixels
const RULER_BG = "rgba(20,20,20,0.72)"
const TICK_COLOR = "rgba(255,255,255,0.8)"
const TICK_COLOR_MINOR = "rgba(255,255,255,0.35)"
const LABEL_COLOR = "rgba(255,255,255,0.75)"
const LABEL_FONT_SIZE = 10
const SPAN_HEIGHT = 6          // screen pixels
const SPAN_OPACITY = 0.55

/** Choose tick interval (in frame pixels) based on zoom */
function tickInterval(zoom: number): { major: number; minor: number } {
  if (zoom < 0.3) return { major: 500, minor: 100 }
  if (zoom < 0.6) return { major: 200, minor: 50 }
  if (zoom < 1.2) return { major: 100, minor: 20 }
  if (zoom < 2.5) return { major: 50,  minor: 10 }
  return { major: 20, minor: 5 }
}

export function drawRulers(opts: RulerDrawOptions): void {
  const { layer, frameWidth, frameHeight, frameOffsetX, frameOffsetY, zoom, projections } = opts
  layer.destroyChildren()

  const inv = 1 / zoom
  const rulerThick = RULER_THICKNESS * inv
  const spanH = SPAN_HEIGHT * inv
  const fontSize = LABEL_FONT_SIZE * inv
  const { major, minor } = tickInterval(zoom)

  // ── X ruler (horizontal, top of frame) ──────────────────────────────────

  // Background rect
  layer.add(new Konva.Rect({
    x: frameOffsetX,
    y: frameOffsetY - rulerThick,
    width: frameWidth,
    height: rulerThick,
    fill: RULER_BG,
    listening: false,
  }))

  // Projection spans
  for (const proj of projections) {
    if (proj.xMax <= proj.xMin) continue
    const spanY = frameOffsetY - rulerThick + (rulerThick - spanH) / 2
    layer.add(new Konva.Rect({
      x: frameOffsetX + proj.xMin,
      y: spanY,
      width: proj.xMax - proj.xMin,
      height: spanH,
      fill: proj.color,
      opacity: SPAN_OPACITY,
      listening: false,
    }))
  }

  // Ticks
  for (let px = 0; px <= frameWidth; px += minor) {
    const isMajor = px % major === 0
    const tickH = isMajor ? rulerThick * 0.55 : rulerThick * 0.28
    const x = frameOffsetX + px
    layer.add(new Konva.Line({
      points: [x, frameOffsetY - tickH, x, frameOffsetY],
      stroke: isMajor ? TICK_COLOR : TICK_COLOR_MINOR,
      strokeWidth: inv,
      listening: false,
    }))
    if (isMajor && px > 0) {
      layer.add(new Konva.Text({
        x: x + 2 * inv,
        y: frameOffsetY - rulerThick + 2 * inv,
        text: String(px),
        fontSize,
        fill: LABEL_COLOR,
        listening: false,
      }))
    }
  }

  // ── Y ruler (vertical, left of frame) ────────────────────────────────────

  // Background rect
  layer.add(new Konva.Rect({
    x: frameOffsetX - rulerThick,
    y: frameOffsetY,
    width: rulerThick,
    height: frameHeight,
    fill: RULER_BG,
    listening: false,
  }))

  // Projection spans
  for (const proj of projections) {
    if (proj.yMax <= proj.yMin) continue
    const spanX = frameOffsetX - rulerThick + (rulerThick - spanH) / 2
    layer.add(new Konva.Rect({
      x: spanX,
      y: frameOffsetY + proj.yMin,
      width: spanH,
      height: proj.yMax - proj.yMin,
      fill: proj.color,
      opacity: SPAN_OPACITY,
      listening: false,
    }))
  }

  // Ticks + labels
  for (let py = 0; py <= frameHeight; py += minor) {
    const isMajor = py % major === 0
    const tickW = isMajor ? rulerThick * 0.55 : rulerThick * 0.28
    const y = frameOffsetY + py
    layer.add(new Konva.Line({
      points: [frameOffsetX - tickW, y, frameOffsetX, y],
      stroke: isMajor ? TICK_COLOR : TICK_COLOR_MINOR,
      strokeWidth: inv,
      listening: false,
    }))
    if (isMajor && py > 0) {
      // Rotated label — draw then rotate around anchor point
      const label = new Konva.Text({
        x: frameOffsetX - rulerThick + 2 * inv,
        y,
        text: String(py),
        fontSize,
        fill: LABEL_COLOR,
        listening: false,
        rotation: -90,
      })
      // Offset so it reads top→bottom
      label.offsetX(label.width())
      layer.add(label)
    }
  }

  layer.batchDraw()
}
