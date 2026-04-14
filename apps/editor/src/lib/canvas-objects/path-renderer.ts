import Konva from "konva"
import { Registry, Result } from "@effect-atom/atom"
import type { YLinkedListLens, YLens } from "effect-yjs"
import { buildSvgPathData, computeOuterPath } from "./bezier-math"
import type { BezierPointData } from "./path"
import { createModuleLogger } from "../logger"
import { activeLayerIdAtom } from "../layer-atoms"
import { zoomAtom } from "../viewport-atoms"
import { tokens } from "@/tokens"

const log = createModuleLogger("path-renderer")

const PATH_COLOR = tokens.color.canvas.edge
const PATH_COLOR_INACTIVE = tokens.color.canvas.edgeInactive
const PATH_WIDTH = tokens.canvas.pathWidth
const HIT_TOLERANCE = tokens.canvas.hitTolerance
const GRADIENT_STEPS = 6

export interface PathRendererOptions {
  appRegistry?: Registry.Registry
  layerId?: string
  onSelect?: () => void
  colorLens?: YLens<string>
}

export class PathRenderer {
  private readonly registry: Registry.Registry
  private readonly fillLayer: Konva.Layer
  private readonly pathLine: Konva.Path
  private readonly outerPathLine: Konva.Path
  private readonly gradientShape: Konva.Shape
  private readonly onSelect?: () => void
  private readonly maskLens: any
  private fillColor: string | null
  private fillOpacity: number
  private _innerLens: YLinkedListLens<BezierPointData>
  private _outerLens: YLinkedListLens<BezierPointData>
  private _outerMode: "uniform" | "free"
  private _bufferDistance: number
  private _isClosed = false
  private currentZoom = 1
  private gradientBands: string[] = []
  private unsubscribeList: (() => void) | null = null
  private unsubscribeOuterList: (() => void) | null = null
  private unsubscribeMaskFields: (() => void) | null = null
  private unsubscribeColor: (() => void) | null = null
  private readonly layerId: string
  private unsubscribeApp: (() => void) | null = null

  constructor(
    maskLens: any,
    fillLayer: Konva.Layer,
    options?: PathRendererOptions,
  ) {
    this.maskLens = maskLens
    this.fillLayer = fillLayer
    this.registry = Registry.make()
    this.onSelect = options?.onSelect
    this.fillOpacity = 0
    this.layerId = options?.layerId ?? ""

    // Derive lenses and initial values from maskLens
    this._innerLens = maskLens.focus("inner")
    this._outerLens = maskLens.focus("outer")
    const maskData = maskLens.syncGet()
    this._bufferDistance = maskData?.bufferDistance ?? 20
    this._outerMode = maskData?.outerMode ?? "uniform"
    this.fillColor = null

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
      stroke: PATH_COLOR_INACTIVE,
      strokeWidth: 1,
      dash: [6, 4],
      opacity: 0.5,
      visible: false,
      listening: true,
      hitStrokeWidth: HIT_TOLERANCE * 2,
    })
    this.fillLayer.add(this.outerPathLine)

    this.gradientShape = new Konva.Shape({
      listening: false,
      visible: false,
      sceneFunc: (ctx, shape) => this.drawGradientBands(ctx, shape),
    })
    this.fillLayer.add(this.gradientShape)

    this.pathLine.on("pointerdown", (e) => {
      e.cancelBubble = true
      this.onSelect?.()
    })

    this.startRenderLoop()
    this.startOuterRenderLoop()
    this.startMaskFieldSubscriptions()
    this.startColorSubscription(options?.colorLens)

    // Self-subscribe to zoom and active layer
    if (options?.appRegistry) {
      this.startAppSubscriptions(options.appRegistry)
    }
  }

  private startRenderLoop(): void {
    const listAtom = this._innerLens.atom()
    this.unsubscribeList = this.registry.subscribe(listAtom, () => {
      this.updatePathLine()
    }, { immediate: true })
  }

  private startOuterRenderLoop(): void {
    const outerAtom = this._outerLens.atom()
    this.unsubscribeOuterList = this.registry.subscribe(outerAtom, () => {
      if (this._outerMode !== "free") return
      const outerSvg = buildSvgPathData(this._outerLens.get())
      this.outerPathLine.data(outerSvg)
      this.fillLayer.batchDraw()
    }, { immediate: true })
  }

  private startMaskFieldSubscriptions(): void {
    try {
      const bufferAtom = this.maskLens.focus("bufferDistance").atom()
      const modeAtom = this.maskLens.focus("outerMode").atom()

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

  private startColorSubscription(colorLens?: YLens<string>): void {
    if (!colorLens) return
    const colorAtom = colorLens.atom()
    this.unsubscribeColor = this.registry.subscribe(colorAtom, (val: unknown) => {
      const color = typeof val === "string" && val.length > 0 ? val : null
      if (color !== this.fillColor) {
        this.fillColor = color
        this.outerPathLine.stroke(color ?? PATH_COLOR_INACTIVE)
        this.applyFill()
        this.fillLayer.batchDraw()
      }
    }, { immediate: true })
  }

  private startAppSubscriptions(appRegistry: Registry.Registry): void {
    const unsub1 = appRegistry.subscribe(zoomAtom, (zoomResult) => {
      const zoom = Result.isSuccess(zoomResult) ? zoomResult.value : 1
      this.updateScale(zoom)
    }, { immediate: true })

    const unsub2 = appRegistry.subscribe(activeLayerIdAtom, (result) => {
      const activeId = Result.isSuccess(result) ? result.value : null
      if (activeId === null) {
        this.setFillOpacity(0.25)
      } else if (activeId === this.layerId) {
        this.setFillOpacity(0.35)
      } else {
        this.setFillOpacity(0.15)
      }
    }, { immediate: true })

    this.unsubscribeApp = () => { unsub1(); unsub2() }
  }

  private applyFill(): void {
    if (this._isClosed && this.fillColor && this.fillOpacity > 0) {
      this.pathLine.fill(this.fillColor)
      this.pathLine.opacity(this.fillOpacity)
      this.gradientShape.visible(true)
    } else {
      this.pathLine.fill("")
      this.pathLine.opacity(1)
      this.gradientShape.visible(false)
    }
  }

  /**
   * Draw gradient bands between inner and outer paths.
   * Renders GRADIENT_STEPS intermediate offset paths with decreasing opacity
   * to create a smooth fade from inner (full opacity) to outer (transparent).
   */
  private drawGradientBands(ctx: Konva.Context, _shape: Konva.Shape): void {
    if (!this._isClosed || !this.fillColor || this.gradientBands.length === 0) return

    const canvas = ctx.getCanvas()._canvas as HTMLCanvasElement
    const nativeCtx = canvas.getContext("2d")
    if (!nativeCtx) return

    for (let i = 0; i < this.gradientBands.length; i++) {
      const t = (i + 1) / (this.gradientBands.length + 1)
      const alpha = this.fillOpacity * (1 - t)
      nativeCtx.save()
      nativeCtx.globalAlpha = alpha
      nativeCtx.fillStyle = this.fillColor
      const path2d = new Path2D(this.gradientBands[i])
      nativeCtx.fill(path2d)
      nativeCtx.restore()
    }
  }

  private buildGradientBands(): void {
    if (!this._isClosed) {
      this.gradientBands = []
      return
    }
    const innerPoints = this._innerLens.get()
    const bands: string[] = []
    for (let i = 1; i <= GRADIENT_STEPS; i++) {
      const t = i / (GRADIENT_STEPS + 1)
      const dist = this._bufferDistance * t
      const offsetPoints = computeOuterPath(innerPoints, dist)
      const svg = buildSvgPathData(offsetPoints)
      if (svg.includes("Z")) bands.push(svg)
    }
    this.gradientBands = bands
  }

  private updatePathLine(): void {
    const points = this._innerLens.get()
    const svgData = buildSvgPathData(points)
    this.pathLine.data(svgData)
    const wasClosed = this._isClosed
    this._isClosed = svgData.includes("Z")
    if (this._isClosed !== wasClosed) this.applyFill()
    if (this._isClosed) {
      if (this._outerMode === "uniform") {
        const outerPoints = computeOuterPath(points, this._bufferDistance)
        while (this._outerLens.length() > 0) this._outerLens.removeAt(0)
        for (const pt of outerPoints) this._outerLens.append(pt)
      }
      const outerSvg = buildSvgPathData(this._outerLens.get())
      this.outerPathLine.data(outerSvg)
      this.outerPathLine.visible(true)
      this.buildGradientBands()
    } else {
      this.outerPathLine.visible(false)
      this.gradientBands = []
      this.gradientShape.visible(false)
    }
    this.fillLayer.batchDraw()
  }

  private rebuildOuterPath(): void {
    if (!this._isClosed) return
    const points = this._innerLens.get()
    if (this._outerMode === "uniform") {
      const outerPoints = computeOuterPath(points, this._bufferDistance)
      while (this._outerLens.length() > 0) this._outerLens.removeAt(0)
      for (const pt of outerPoints) this._outerLens.append(pt)
    }
    this.outerPathLine.data(buildSvgPathData(this._outerLens.get()))
    this.outerPathLine.visible(true)
    this.buildGradientBands()
    this.fillLayer.batchDraw()
  }

  private setFillOpacity(opacity: number): void {
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

  private updateScale(zoom: number): void {
    this.currentZoom = zoom
    this.pathLine.strokeWidth(PATH_WIDTH / zoom)
    this.pathLine.hitStrokeWidth(HIT_TOLERANCE * 2 / zoom)
    this.outerPathLine.strokeWidth(1 / zoom)
    this.fillLayer.batchDraw()
  }

  getPoints(): ReadonlyArray<BezierPointData> {
    return this._innerLens.get()
  }

  appendPoint(x: number, y: number): string {
    return this._innerLens.append({
      x, y,
      handleInAngle: 0, handleInDistance: 0,
      handleOutAngle: 0, handleOutDistance: 0,
    })
  }

  get isClosed(): boolean { return this._isClosed }
  get innerLens(): YLinkedListLens<BezierPointData> { return this._innerLens }
  get outerLens(): YLinkedListLens<BezierPointData> { return this._outerLens }
  get currentBufferDistance(): number { return this._bufferDistance }
  get currentOuterMode(): "uniform" | "free" { return this._outerMode }
  // Exposed for PathEditor to attach event handlers
  get pathLineNode(): Konva.Path { return this.pathLine }
  get outerPathLineNode(): Konva.Path { return this.outerPathLine }

  setBufferDistance(distance: number): void {
    if (distance === this._bufferDistance) return
    this._bufferDistance = distance
    if (this._isClosed) this.updatePathLine()
  }

  dispose(): void {
    this.unsubscribeApp?.()
    this.unsubscribeList?.()
    this.unsubscribeOuterList?.()
    this.unsubscribeMaskFields?.()
    this.unsubscribeColor?.()
    this.gradientShape.destroy()
    this.outerPathLine.destroy()
    this.pathLine.destroy()
    this.registry.dispose()
  }
}
