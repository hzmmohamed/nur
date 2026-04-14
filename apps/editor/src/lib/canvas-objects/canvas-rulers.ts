import Konva from "konva"

export interface LayerProjection {
  color: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface DrawRulersOptions {
  layer: Konva.Layer
  stageW: number
  stageH: number
  /** screen px x position of frame's top-left corner */
  frameOriginX: number
  /** screen px y position of frame's top-left corner */
  frameOriginY: number
  zoom: number
  projections: LayerProjection[]
}

const RULER_SIZE = 20
const RULER_BG = "rgba(20,20,20,0.72)"
const TICK_COLOR = "rgba(255,255,255,0.8)"
const TICK_COLOR_MINOR = "rgba(255,255,255,0.35)"
const LABEL_COLOR = "rgba(255,255,255,0.75)"
const LABEL_FONT_SIZE = 10
const SPAN_HEIGHT = 6
const SPAN_OPACITY = 0.55

function tickInterval(zoom: number): { major: number; minor: number } {
  if (zoom < 0.3) return { major: 500, minor: 100 }
  if (zoom < 0.6) return { major: 200, minor: 50 }
  if (zoom < 1.2) return { major: 100, minor: 20 }
  if (zoom < 2.5) return { major: 50, minor: 10 }
  return { major: 20, minor: 5 }
}

export function drawRulers(opts: DrawRulersOptions): void {
  const { layer, stageW, stageH, frameOriginX, frameOriginY, zoom, projections } = opts
  layer.destroyChildren()

  // Since the layer has inverse transform applied, all coordinates here are screen px.
  // frame coordinate px → screen px: screenX = frameOriginX + px * zoom
  const toScreenX = (px: number) => frameOriginX + px * zoom
  const toScreenY = (py: number) => frameOriginY + py * zoom

  const { major, minor } = tickInterval(zoom)

  // Tick range: cover entire stage in both axes
  const xStart = Math.floor((0 - frameOriginX) / zoom / minor) * minor
  const xEnd   = Math.ceil((stageW - frameOriginX) / zoom / minor) * minor
  const yStart = Math.floor((0 - frameOriginY) / zoom / minor) * minor
  const yEnd   = Math.ceil((stageH - frameOriginY) / zoom / minor) * minor

  // ── X ruler background ──────────────────────────────────────────────
  layer.add(new Konva.Rect({
    x: 0, y: 0,
    width: stageW,
    height: RULER_SIZE,
    fill: RULER_BG,
    listening: false,
  }))

  // X projection spans
  for (const proj of projections) {
    if (proj.xMax <= proj.xMin) continue
    layer.add(new Konva.Rect({
      x: toScreenX(proj.xMin),
      y: (RULER_SIZE - SPAN_HEIGHT) / 2,
      width: (proj.xMax - proj.xMin) * zoom,
      height: SPAN_HEIGHT,
      fill: proj.color,
      opacity: SPAN_OPACITY,
      listening: false,
    }))
  }

  // X ticks + labels
  for (let px = xStart; px <= xEnd; px += minor) {
    const isMajor = px % major === 0
    const sx = toScreenX(px)
    const tickH = isMajor ? RULER_SIZE * 0.55 : RULER_SIZE * 0.28
    layer.add(new Konva.Line({
      points: [sx, RULER_SIZE - tickH, sx, RULER_SIZE],
      stroke: isMajor ? TICK_COLOR : TICK_COLOR_MINOR,
      strokeWidth: 1,
      listening: false,
    }))
    if (isMajor) {
      layer.add(new Konva.Text({
        x: sx + 2,
        y: 2,
        text: String(px),
        fontSize: LABEL_FONT_SIZE,
        fill: LABEL_COLOR,
        listening: false,
      }))
    }
  }

  // ── Y ruler background ──────────────────────────────────────────────
  layer.add(new Konva.Rect({
    x: 0, y: 0,
    width: RULER_SIZE,
    height: stageH,
    fill: RULER_BG,
    listening: false,
  }))

  // Y projection spans
  for (const proj of projections) {
    if (proj.yMax <= proj.yMin) continue
    layer.add(new Konva.Rect({
      x: (RULER_SIZE - SPAN_HEIGHT) / 2,
      y: toScreenY(proj.yMin),
      width: SPAN_HEIGHT,
      height: (proj.yMax - proj.yMin) * zoom,
      fill: proj.color,
      opacity: SPAN_OPACITY,
      listening: false,
    }))
  }

  // Y ticks + labels
  for (let py = yStart; py <= yEnd; py += minor) {
    const isMajor = py % major === 0
    const sy = toScreenY(py)
    const tickW = isMajor ? RULER_SIZE * 0.55 : RULER_SIZE * 0.28
    layer.add(new Konva.Line({
      points: [RULER_SIZE - tickW, sy, RULER_SIZE, sy],
      stroke: isMajor ? TICK_COLOR : TICK_COLOR_MINOR,
      strokeWidth: 1,
      listening: false,
    }))
    if (isMajor) {
      const label = new Konva.Text({
        x: 2,
        y: sy - 2,
        text: String(py),
        fontSize: LABEL_FONT_SIZE,
        fill: LABEL_COLOR,
        listening: false,
        rotation: -90,
      })
      label.offsetX(label.width())
      layer.add(label)
    }
  }

  layer.batchDraw()
}
