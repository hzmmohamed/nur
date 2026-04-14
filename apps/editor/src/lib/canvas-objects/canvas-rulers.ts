import Konva from "konva"
import type { Atom } from "@effect-atom/atom"
import { Result } from "@effect-atom/atom"
import { zoomAtom } from "../viewport-atoms"
import { stagePositionAtom, stageSizeAtom } from "../../components/canvas-minimap"
import { visibleMasksAtom } from "../visible-masks-atom"

export interface LayerProjection {
  color: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

// ── Visual constants ──────────────────────────────────────────────

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

// ── CanvasRulers ──────────────────────────────────────────────────

interface CanvasRulersOptions {
  stage: Konva.Stage
  registry: {
    subscribe(atom: Atom.Atom<any>, cb: (val: any) => void, opts?: { immediate?: boolean }): () => void
    get(atom: Atom.Atom<any>): any
  }
  /** Root Y.Doc lens for reading layer/mask data */
  root: any
  /** Returns current frame image offset in stage coordinates */
  getFrameOffset: () => { x: number; y: number }
}

export class CanvasRulers {
  private layer: Konva.Layer
  private stage: Konva.Stage
  private registry: CanvasRulersOptions["registry"]
  private root: any
  private getFrameOffset: () => { x: number; y: number }
  private currentFrameId: string | null = null
  private unsubs: Array<() => void> = []

  constructor(opts: CanvasRulersOptions) {
    this.stage = opts.stage
    this.registry = opts.registry
    this.root = opts.root
    this.getFrameOffset = opts.getFrameOffset

    this.layer = new Konva.Layer({ listening: false })
    this.stage.add(this.layer)

    // Subscribe to zoom — ticks shift to keep 0 at frame origin
    this.unsubs.push(
      this.registry.subscribe(zoomAtom, () => this.redraw(), { immediate: true }),
    )

    // Subscribe to pan — projections + ticks shift
    this.unsubs.push(
      this.registry.subscribe(stagePositionAtom, () => this.redraw()),
    )

    // Subscribe to stage resize
    this.unsubs.push(
      this.registry.subscribe(stageSizeAtom, () => this.redraw()),
    )

    // Subscribe to visible masks — projections update on frame/layer/mask change
    this.unsubs.push(
      this.registry.subscribe(visibleMasksAtom, () => this.redraw()),
    )
  }

  /** Called externally when currentFrameId changes */
  setFrameId(frameId: string | null): void {
    this.currentFrameId = frameId
  }

  redraw(): void {
    // Counteract stage transform so rulers draw in screen space
    const zoom = this.stage.scaleX()
    const pos = this.stage.position()
    const off = this.stage.offset()
    this.layer.position({ x: -pos.x / zoom + off.x, y: -pos.y / zoom + off.y })
    this.layer.scale({ x: 1 / zoom, y: 1 / zoom })

    const frameOff = this.getFrameOffset()
    const frameOriginX = (frameOff.x - off.x) * zoom + pos.x
    const frameOriginY = (frameOff.y - off.y) * zoom + pos.y
    const stageW = this.stage.width()
    const stageH = this.stage.height()

    this.layer.destroyChildren()

    const toScreenX = (px: number) => frameOriginX + px * zoom
    const toScreenY = (py: number) => frameOriginY + py * zoom

    const { major, minor } = tickInterval(zoom)

    // Tick range: cover entire stage
    const xStart = Math.floor((0 - frameOriginX) / zoom / minor) * minor
    const xEnd = Math.ceil((stageW - frameOriginX) / zoom / minor) * minor
    const yStart = Math.floor((0 - frameOriginY) / zoom / minor) * minor
    const yEnd = Math.ceil((stageH - frameOriginY) / zoom / minor) * minor

    const projections = this.collectProjections()

    // ── X ruler ───────────────────────────────────────────────────
    this.layer.add(new Konva.Rect({
      x: 0, y: 0, width: stageW, height: RULER_SIZE,
      fill: RULER_BG, listening: false,
    }))

    for (const proj of projections) {
      if (proj.xMax <= proj.xMin) continue
      this.layer.add(new Konva.Rect({
        x: toScreenX(proj.xMin),
        y: (RULER_SIZE - SPAN_HEIGHT) / 2,
        width: (proj.xMax - proj.xMin) * zoom,
        height: SPAN_HEIGHT,
        fill: proj.color, opacity: SPAN_OPACITY, listening: false,
      }))
    }

    for (let px = xStart; px <= xEnd; px += minor) {
      const isMajor = px % major === 0
      const sx = toScreenX(px)
      const tickH = isMajor ? RULER_SIZE * 0.55 : RULER_SIZE * 0.28
      this.layer.add(new Konva.Line({
        points: [sx, RULER_SIZE - tickH, sx, RULER_SIZE],
        stroke: isMajor ? TICK_COLOR : TICK_COLOR_MINOR,
        strokeWidth: 1, listening: false,
      }))
      if (isMajor) {
        this.layer.add(new Konva.Text({
          x: sx + 2, y: 2,
          text: String(px), fontSize: LABEL_FONT_SIZE,
          fill: LABEL_COLOR, listening: false,
        }))
      }
    }

    // ── Y ruler ───────────────────────────────────────────────────
    this.layer.add(new Konva.Rect({
      x: 0, y: 0, width: RULER_SIZE, height: stageH,
      fill: RULER_BG, listening: false,
    }))

    for (const proj of projections) {
      if (proj.yMax <= proj.yMin) continue
      this.layer.add(new Konva.Rect({
        x: (RULER_SIZE - SPAN_HEIGHT) / 2,
        y: toScreenY(proj.yMin),
        width: SPAN_HEIGHT,
        height: (proj.yMax - proj.yMin) * zoom,
        fill: proj.color, opacity: SPAN_OPACITY, listening: false,
      }))
    }

    for (let py = yStart; py <= yEnd; py += minor) {
      const isMajor = py % major === 0
      const sy = toScreenY(py)
      const tickW = isMajor ? RULER_SIZE * 0.55 : RULER_SIZE * 0.28
      this.layer.add(new Konva.Line({
        points: [RULER_SIZE - tickW, sy, RULER_SIZE, sy],
        stroke: isMajor ? TICK_COLOR : TICK_COLOR_MINOR,
        strokeWidth: 1, listening: false,
      }))
      if (isMajor) {
        const label = new Konva.Text({
          x: 2, y: sy - 2,
          text: String(py), fontSize: LABEL_FONT_SIZE,
          fill: LABEL_COLOR, listening: false, rotation: -90,
        })
        label.offsetX(label.width())
        this.layer.add(label)
      }
    }

    this.layer.batchDraw()
  }

  private collectProjections(): LayerProjection[] {
    if (!this.currentFrameId) return []
    const layersRecord = (this.root.focus("layers").syncGet() ?? {}) as Record<string, any>
    const result: LayerProjection[] = []
    for (const [layerId, layerData] of Object.entries(layersRecord)) {
      const masksRecord = layerData?.masks
      if (!masksRecord || typeof masksRecord !== "object") continue
      const frameMasks = masksRecord[this.currentFrameId] as Record<string, any> | undefined
      if (!frameMasks) continue
      let xMin = Infinity, xMax = -Infinity
      let yMin = Infinity, yMax = -Infinity
      for (const maskId of Object.keys(frameMasks)) {
        try {
          const maskData = (this.root.focus("layers").focus(layerId) as any)
            .focus("masks").focus(this.currentFrameId).focus(maskId).syncGet()
          const inner = maskData?.inner
          if (!Array.isArray(inner)) continue
          for (const pt of inner as Array<{ x: number; y: number }>) {
            if (pt.x < xMin) xMin = pt.x
            if (pt.x > xMax) xMax = pt.x
            if (pt.y < yMin) yMin = pt.y
            if (pt.y > yMax) yMax = pt.y
          }
        } catch { /* skip */ }
      }
      if (xMin !== Infinity) {
        result.push({ color: (layerData as any).color ?? "#888", xMin, xMax, yMin, yMax })
      }
    }
    return result
  }

  dispose(): void {
    for (const unsub of this.unsubs) unsub()
    this.unsubs = []
    this.layer.destroy()
  }
}
