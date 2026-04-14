import Konva from "konva"
import { Registry } from "@effect-atom/atom"
import type { YLinkedListLens } from "effect-yjs"
import { buildSvgPathData, computeOuterPath } from "./bezier-math"
import type { BezierPointData } from "./path"
import { createModuleLogger } from "../logger"
import { tokens } from "@/tokens"

const log = createModuleLogger("path-renderer")

const PATH_COLOR = tokens.color.canvas.edge
const PATH_COLOR_INACTIVE = tokens.color.canvas.edgeInactive
const PATH_WIDTH = tokens.canvas.pathWidth
const HIT_TOLERANCE = tokens.canvas.hitTolerance

export interface PathRendererOptions {
  onSelect?: () => void
  color?: string
  fillOpacity?: number
  outerLens?: YLinkedListLens<BezierPointData>
  bufferDistance?: number
  outerMode?: "uniform" | "free"
  onBufferChange?: (distance: number) => void
  maskLens?: any
}

export class PathRenderer {
  private readonly registry: Registry.Registry
  private readonly lens: YLinkedListLens<BezierPointData>
  private readonly fillLayer: Konva.Layer
  private readonly pathLine: Konva.Path
  private readonly outerPathLine: Konva.Path
  private readonly onSelect?: () => void
  private fillColor: string | null
  private fillOpacity: number
  private _outerLens: YLinkedListLens<BezierPointData> | null
  private _outerMode: "uniform" | "free"
  private _bufferDistance: number
  private _isClosed = false
  private currentZoom = 1
  private unsubscribeList: (() => void) | null = null
  private unsubscribeOuterList: (() => void) | null = null
  private unsubscribeMaskFields: (() => void) | null = null
  private readonly onBufferChange?: (distance: number) => void

  constructor(
    lens: YLinkedListLens<BezierPointData>,
    fillLayer: Konva.Layer,
    options?: PathRendererOptions,
  ) {
    this.lens = lens
    this.fillLayer = fillLayer
    this.registry = Registry.make()
    this.onSelect = options?.onSelect
    this.fillColor = options?.color ?? null
    this.fillOpacity = options?.fillOpacity ?? 0
    this._outerLens = options?.outerLens ?? null
    this._outerMode = options?.outerMode ?? "uniform"
    this._bufferDistance = options?.bufferDistance ?? 20
    this.onBufferChange = options?.onBufferChange

    this.pathLine = new Konva.Path({
      data: "",
      stroke: PATH_COLOR,
      strokeWidth: PATH_WIDTH,
      listening: true,
      hitStrokeWidth: HIT_TOLERANCE * 2,
    })
    this.fillLayer.add(this.pathLine)

    this.outerPathLine = new Konva.Path({
      data: "",
      stroke: this.fillColor ?? PATH_COLOR_INACTIVE,
      strokeWidth: 1,
      dash: [6, 4],
      opacity: 0.5,
      visible: false,
      listening: true,
      hitStrokeWidth: HIT_TOLERANCE * 2,
    })
    this.fillLayer.add(this.outerPathLine)

    this.pathLine.on("pointerdown", (e) => {
      e.cancelBubble = true
      this.onSelect?.()
    })

    this.startOuterDragHandler()
    this.startRenderLoop()
    this.startOuterRenderLoop()
    this.startMaskFieldSubscriptions(options?.maskLens)
  }

  private startRenderLoop(): void {
    const listAtom = this.lens.atom()
    this.unsubscribeList = this.registry.subscribe(listAtom, () => {
      this.updatePathLine()
    }, { immediate: true })
  }

  private startOuterRenderLoop(): void {
    if (!this._outerLens) return
    const outerAtom = this._outerLens.atom()
    this.unsubscribeOuterList = this.registry.subscribe(outerAtom, () => {
      if (this._outerMode !== "free" || !this._outerLens) return
      const outerSvg = buildSvgPathData(this._outerLens.get())
      this.outerPathLine.data(outerSvg)
      this.fillLayer.batchDraw()
    }, { immediate: true })
  }

  private startMaskFieldSubscriptions(maskLens: any): void {
    if (!maskLens) return
    try {
      const bufferAtom = maskLens.focus("bufferDistance").atom()
      const modeAtom = maskLens.focus("outerMode").atom()

      const unsub1 = this.registry.subscribe(bufferAtom, (val: unknown) => {
        const dist = typeof val === "number" ? val : 20
        if (dist !== this._bufferDistance) {
          this._bufferDistance = dist
          if (this._outerMode === "uniform" && this._isClosed) this.rebuildOuterPath()
        }
      }, { immediate: true })

      const unsub2 = this.registry.subscribe(modeAtom, (val: unknown) => {
        const mode = val === "free" ? "free" as const : "uniform" as const
        if (mode !== this._outerMode) {
          this._outerMode = mode
          if (mode === "uniform" && this._isClosed) this.rebuildOuterPath()
        }
      }, { immediate: true })

      this.unsubscribeMaskFields = () => { unsub1(); unsub2() }
    } catch { /* new mask, fields not yet present */ }
  }

  private startOuterDragHandler(): void {
    // Port drag-to-buffer handler from bezier-curve.ts lines 123–172
    // In uniform mode, dragging the outer path adjusts buffer distance
    let outerDragStart: { x: number; y: number; startBuffer: number } | null = null

    this.outerPathLine.on("pointerdown", (e) => {
      if (this._outerMode !== "uniform") return
      e.cancelBubble = true
      const stage = this.fillLayer.getStage()
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return
      outerDragStart = { x: pos.x, y: pos.y, startBuffer: this._bufferDistance }

      const onMove = () => {
        if (!outerDragStart) return
        const stagePos = stage.getPointerPosition()
        if (!stagePos) return
        const dx = stagePos.x - outerDragStart.x
        const dy = stagePos.y - outerDragStart.y
        const delta = Math.sqrt(dx * dx + dy * dy) * Math.sign(dx + dy)
        const zoom = stage.scaleX() || 1
        const newBuffer = Math.max(2, outerDragStart.startBuffer + delta / zoom)
        this._bufferDistance = Math.round(newBuffer)
        this.onBufferChange?.(this._bufferDistance)
        if (this._isClosed) this.updatePathLine()
      }

      const onUp = () => {
        outerDragStart = null
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    })

    this.outerPathLine.on("pointerenter", () => {
      if (this._outerMode === "uniform") {
        const s = this.fillLayer.getStage()
        if (s) s.container().style.cursor = "ew-resize"
      }
    })
    this.outerPathLine.on("pointerleave", () => {
      const s = this.fillLayer.getStage()
      if (s) s.container().style.cursor = "default"
    })
  }

  private applyFill(): void {
    if (this._isClosed && this.fillColor && this.fillOpacity > 0) {
      this.pathLine.fill(this.fillColor)
      this.pathLine.opacity(this.fillOpacity)
    } else {
      this.pathLine.fill("")
      this.pathLine.opacity(1)
    }
  }

  private updatePathLine(): void {
    const points = this.lens.get()
    const svgData = buildSvgPathData(points)
    this.pathLine.data(svgData)
    const wasClosed = this._isClosed
    this._isClosed = svgData.includes("Z")
    if (this._isClosed !== wasClosed) this.applyFill()
    if (this._isClosed && this._outerLens) {
      if (this._outerMode === "uniform") {
        const outerPoints = computeOuterPath(points, this._bufferDistance)
        while (this._outerLens.length() > 0) this._outerLens.removeAt(0)
        for (const pt of outerPoints) this._outerLens.append(pt)
      }
      const outerSvg = buildSvgPathData(this._outerLens.get())
      this.outerPathLine.data(outerSvg)
      this.outerPathLine.visible(true)
    } else {
      this.outerPathLine.visible(false)
    }
    this.fillLayer.batchDraw()
  }

  private rebuildOuterPath(): void {
    if (!this._outerLens || !this._isClosed) return
    const points = this.lens.get()
    if (this._outerMode === "uniform") {
      const outerPoints = computeOuterPath(points, this._bufferDistance)
      while (this._outerLens.length() > 0) this._outerLens.removeAt(0)
      for (const pt of outerPoints) this._outerLens.append(pt)
    }
    this.outerPathLine.data(buildSvgPathData(this._outerLens.get()))
    this.outerPathLine.visible(true)
    this.fillLayer.batchDraw()
  }

  setFillOpacity(opacity: number): void {
    this.fillOpacity = opacity
    this.applyFill()
    this.fillLayer.batchDraw()
  }

  setHighlighted(on: boolean): void {
    if (on && this._isClosed) {
      this.pathLine.opacity(Math.min(this.fillOpacity + 0.15, 0.6))
    } else {
      this.applyFill()
    }
    this.fillLayer.batchDraw()
  }

  updateScale(zoom: number): void {
    this.currentZoom = zoom
    this.pathLine.strokeWidth(PATH_WIDTH / zoom)
    this.pathLine.hitStrokeWidth(HIT_TOLERANCE * 2 / zoom)
    this.outerPathLine.strokeWidth(1 / zoom)
    this.fillLayer.batchDraw()
  }

  getPoints(): ReadonlyArray<BezierPointData> {
    return this.lens.get()
  }

  appendPoint(x: number, y: number): string {
    return this.lens.append({
      x, y,
      handleInAngle: 0, handleInDistance: 0,
      handleOutAngle: 0, handleOutDistance: 0,
    })
  }

  get isClosed(): boolean { return this._isClosed }
  get innerLens(): YLinkedListLens<BezierPointData> { return this.lens }
  get outerLens(): YLinkedListLens<BezierPointData> | null { return this._outerLens }
  get currentBufferDistance(): number { return this._bufferDistance }
  get currentOuterMode(): "uniform" | "free" { return this._outerMode }
  // Exposed for PathEditor to attach ghost hover events
  get pathLineNode(): Konva.Path { return this.pathLine }

  dispose(): void {
    this.unsubscribeList?.()
    this.unsubscribeOuterList?.()
    this.unsubscribeMaskFields?.()
    this.outerPathLine.destroy()
    this.pathLine.destroy()
    this.registry.dispose()
  }
}
