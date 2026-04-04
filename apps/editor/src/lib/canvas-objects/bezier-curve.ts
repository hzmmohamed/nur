import Konva from "konva"
import * as HashMap from "effect/HashMap"
import * as HashSet from "effect/HashSet"
import { Registry } from "@effect-atom/atom"
import type { YLinkedListLens } from "effect-yjs"
import { cartesianToPolar, polarToCartesian } from "@/lib/domain/coordinate-utils"
import { buildSvgPathData, findNearestPointOnPath, computeOuterPath } from "./bezier-math"
import type { BezierPointData } from "./path"
import { createModuleLogger } from "../logger"
import { tokens } from "@/tokens"

const bpLog = createModuleLogger("bezier-path")

const POINT_RADIUS = tokens.canvas.pointRadius
const HANDLE_RADIUS = tokens.canvas.handleRadius
const POINT_COLOR = tokens.color.canvas.vertex
const HANDLE_COLOR = tokens.color.canvas.handle
const PATH_COLOR = tokens.color.canvas.edge
const PATH_COLOR_INACTIVE = tokens.color.canvas.edgeInactive
const PATH_WIDTH = tokens.canvas.pathWidth
const PATH_WIDTH_INACTIVE = tokens.canvas.pathWidthInactive
const HANDLE_LINE_COLOR = tokens.color.canvas.edgeGuide
const HIT_TOLERANCE = tokens.canvas.hitTolerance
const POINT_COLOR_HOVER = tokens.color.canvas.vertexHover
const HANDLE_COLOR_HOVER = tokens.color.canvas.handleHover
const POINT_HIT_BUFFER = tokens.canvas.pointHitBuffer
const HANDLE_HIT_BUFFER = tokens.canvas.handleHitBuffer

interface PointObjects {
  group: Konva.Group
  pointCircle: Konva.Circle
  handleInLine: Konva.Line
  handleInCircle: Konva.Circle
  handleOutLine: Konva.Line
  handleOutCircle: Konva.Circle
  unsubscribe: () => void
}

export interface BezierPathOptions {
  onSelect?: () => void
  /** Layer color for fill (e.g. "#4A90D9"). Fill only applies to closed paths. */
  color?: string
  /** Fill opacity: 0.25 (viewing), 0.35 (active editing), 0.15 (inactive editing) */
  fillOpacity?: number
  /** Outer path lens (from MaskSchema.outer) */
  outerLens?: YLinkedListLens<BezierPointData>
  /** Buffer distance for uniform mode */
  bufferDistance?: number
  /** "uniform" (auto-compute) or "free" (independent) */
  outerMode?: "uniform" | "free"
  /** Called when buffer distance changes via outer path drag (uniform mode) */
  onBufferChange?: (distance: number) => void
}

export class BezierPath {
  private readonly registry: Registry.Registry
  private pointObjects: HashMap.HashMap<string, PointObjects> = HashMap.empty()
  private readonly pathLine: Konva.Path
  private readonly layer: Konva.Layer
  private readonly lens: YLinkedListLens<BezierPointData>
  private unsubscribeIds: (() => void) | null = null
  private unsubscribeList: (() => void) | null = null
  private currentIds: HashSet.HashSet<string> = HashSet.empty()
  private active = true
  private readonly onSelect?: () => void
  private readonly ghostVertex: Konva.Circle
  private ghostSplitResult: ReturnType<typeof findNearestPointOnPath> | null = null
  private currentZoom = 1
  private fillColor: string | null = null
  private fillOpacity: number = 0
  private isClosed = false
  private readonly outerPathLine: Konva.Path
  private outerLens: YLinkedListLens<BezierPointData> | null = null
  private outerMode: "uniform" | "free" = "uniform"
  private bufferDistance: number = 20
  private unsubscribeOuterList: (() => void) | null = null
  private editingTarget: "inner" | "outer" = "inner"
  private outerPointObjects: HashMap.HashMap<string, PointObjects> = HashMap.empty()
  private outerCurrentIds: HashSet.HashSet<string> = HashSet.empty()
  private unsubscribeOuterIds: (() => void) | null = null
  private readonly onBufferChange?: (distance: number) => void

  constructor(lens: YLinkedListLens<BezierPointData>, layer: Konva.Layer, options?: BezierPathOptions) {
    this.lens = lens
    this.layer = layer
    this.registry = Registry.make()
    this.onSelect = options?.onSelect
    this.fillColor = options?.color ?? null
    this.fillOpacity = options?.fillOpacity ?? 0
    this.outerLens = options?.outerLens ?? null
    this.outerMode = options?.outerMode ?? "uniform"
    this.bufferDistance = options?.bufferDistance ?? 20
    this.onBufferChange = options?.onBufferChange

    // Create the path line (behind everything)
    this.pathLine = new Konva.Path({
      data: "",
      stroke: this.active ? PATH_COLOR : "transparent",
      strokeWidth: this.active ? PATH_WIDTH : 0,
      listening: true,
      hitStrokeWidth: HIT_TOLERANCE * 2,
    })
    this.layer.add(this.pathLine)

    // Outer path (dashed stroke, no fill, behind inner path line)
    this.outerPathLine = new Konva.Path({
      data: "",
      stroke: this.fillColor ?? PATH_COLOR_INACTIVE,
      strokeWidth: 1,
      dash: [6, 4],
      opacity: 0.5,
      visible: false,
      listening: true,
      hitStrokeWidth: HIT_TOLERANCE * 2,
      draggable: false,
    })
    this.layer.add(this.outerPathLine)

    // Outer path drag-to-buffer: in uniform mode, dragging the outer path adjusts buffer distance
    let outerDragStart: { x: number; y: number; startBuffer: number } | null = null
    this.outerPathLine.on("pointerdown", (e) => {
      if (this.outerMode !== "uniform" || !this.active) return
      e.cancelBubble = true
      const stage = this.layer.getStage()
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return
      outerDragStart = { x: pos.x, y: pos.y, startBuffer: this.bufferDistance }

      const onMove = (me: MouseEvent) => {
        if (!outerDragStart) return
        // Compute drag delta in stage coordinates
        const stagePos = stage.getPointerPosition()
        if (!stagePos) return
        const dx = stagePos.x - outerDragStart.x
        const dy = stagePos.y - outerDragStart.y
        // Use the magnitude of the drag projected outward
        const delta = Math.sqrt(dx * dx + dy * dy) * Math.sign(dx + dy)
        const zoom = stage.scaleX() || 1
        const newBuffer = Math.max(2, outerDragStart.startBuffer + delta / zoom)
        this.bufferDistance = Math.round(newBuffer)
        this.onBufferChange?.(this.bufferDistance)
        if (this.isClosed) this.updatePathLine()
      }

      const onUp = () => {
        outerDragStart = null
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    })

    // Outer path hover cursor
    this.outerPathLine.on("pointerenter", () => {
      if (this.outerMode === "uniform" && this.active) {
        const s = this.layer.getStage()
        if (s) s.container().style.cursor = "ew-resize"
      }
    })
    this.outerPathLine.on("pointerleave", () => {
      if (this.active) {
        const s = this.layer.getStage()
        if (s) s.container().style.cursor = "default"
      }
    })

    // Ghost vertex for edge-insertion preview
    this.ghostVertex = new Konva.Circle({
      radius: POINT_RADIUS,
      fill: POINT_COLOR,
      opacity: tokens.canvas.ghostOpacity,
      visible: false,
      listening: false,
    })
    this.layer.add(this.ghostVertex)

    // Path line hover — highlight inactive paths with increased opacity
    this.pathLine.on("pointerenter", () => {
      if (!this.active && this.isClosed) {
        this.pathLine.opacity(Math.min(this.fillOpacity + 0.15, 0.6))
        const s = this.layer.getStage()
        if (s) s.container().style.cursor = "pointer"
        this.layer.batchDraw()
      }
    })
    this.pathLine.on("pointerleave", () => {
      if (!this.active) {
        this.applyFill()
      }
      this.ghostVertex.visible(false)
      this.ghostSplitResult = null
      const s = this.layer.getStage()
      if (s) s.container().style.cursor = "default"
      this.layer.batchDraw()
    })

    // Ghost vertex positioning on active path edge
    this.pathLine.on("pointermove", () => {
      if (!this.active) return
      const stage = this.layer.getStage()
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return

      const points = this.lens.get()
      const nodesMap = this.lens.nodes()
      const ids = Array.from(nodesMap.keys())

      const result = findNearestPointOnPath(points, pos.x, pos.y, HIT_TOLERANCE, ids)
      if (result) {
        this.ghostVertex.position({ x: result.point.x, y: result.point.y })
        this.ghostVertex.visible(true)
        this.ghostSplitResult = result
        stage.container().style.cursor = "copy"
      } else {
        this.ghostVertex.visible(false)
        this.ghostSplitResult = null
      }
      this.layer.batchDraw()
    })

    // Pointerdown on path line — select (inactive) or insert point (active)
    this.pathLine.on("pointerdown", (e) => {
      e.cancelBubble = true
      if (!this.active && this.onSelect) {
        this.onSelect()
      } else if (this.active && this.ghostSplitResult) {
        this.insertPointFromGhost()
      }
    })

    this.startStructuralLoop()
    this.startPathRenderLoop()
    this.startOuterRenderLoop()
  }

  /** Update point/handle scale to compensate for stage zoom */
  updateScale(zoom: number): void {
    this.currentZoom = zoom
    const inv = 1 / zoom
    HashMap.forEach(this.pointObjects, (objects) => {
      this.applyInverseScale(objects, inv)
    })
    this.ghostVertex.scale({ x: inv, y: inv })
    // Path stroke width should also stay constant (only when active)
    this.pathLine.strokeWidth(this.active ? PATH_WIDTH / zoom : 0)
    this.pathLine.hitStrokeWidth(HIT_TOLERANCE * 2 / zoom)
    this.outerPathLine.strokeWidth(1 / zoom)
    this.layer.batchDraw()
  }

  /** Apply inverse scale to individual circles within a point group */
  private applyInverseScale(objects: PointObjects, inv: number): void {
    objects.pointCircle.scale({ x: inv, y: inv })
    objects.handleInCircle.scale({ x: inv, y: inv })
    objects.handleOutCircle.scale({ x: inv, y: inv })
    // Lines don't need scaling — they're positioned by absolute coords
  }

  /** Set active/inactive visual state. Active shows stroke + points, inactive shows fill only. */
  setActive(active: boolean): void {
    if (this.active === active) return
    this.active = active
    // Active: white stroke. Inactive: no stroke (fill-only).
    this.pathLine.stroke(active ? PATH_COLOR : "transparent")
    this.pathLine.strokeWidth(active ? PATH_WIDTH / this.currentZoom : 0)
    this.pathLine.hitStrokeWidth(HIT_TOLERANCE * 2 / this.currentZoom)
    // Update fill
    this.applyFill()
    // Toggle visibility of all point objects
    HashMap.forEach(this.pointObjects, (objects) => {
      objects.group.visible(active)
    })
    if (!active) {
      this.ghostVertex.visible(false)
      this.ghostSplitResult = null
    }
    this.layer.batchDraw()
  }

  /** Set fill opacity (e.g. when switching between viewing/editing contexts) */
  setFillOpacity(opacity: number): void {
    this.fillOpacity = opacity
    this.applyFill()
    this.layer.batchDraw()
  }

  /** Switch which path (inner/outer) has interactive point objects */
  setEditingTarget(target: "inner" | "outer"): void {
    if (this.editingTarget === target) return
    this.editingTarget = target

    if (target === "inner") {
      // Hide outer point objects, show inner
      this.destroyOuterPointObjects()
      HashMap.forEach(this.pointObjects, (objects) => {
        objects.group.visible(this.active)
      })
      // Inner path gets stroke
      this.pathLine.stroke(this.active ? PATH_COLOR : "transparent")
      this.pathLine.strokeWidth(this.active ? PATH_WIDTH / this.currentZoom : 0)
      // Outer path back to dashed
      this.outerPathLine.stroke(this.fillColor ?? PATH_COLOR_INACTIVE)
      this.outerPathLine.dash([6, 4])
      this.outerPathLine.opacity(0.5)
    } else if (target === "outer" && this.outerLens) {
      // Hide inner point objects, create outer point objects
      HashMap.forEach(this.pointObjects, (objects) => {
        objects.group.visible(false)
      })
      this.createOuterPointObjects()
      // Inner path: just fill, no stroke
      this.pathLine.stroke("transparent")
      this.pathLine.strokeWidth(0)
      // Outer path gets solid stroke
      this.outerPathLine.stroke(PATH_COLOR)
      this.outerPathLine.dash([])
      this.outerPathLine.opacity(1)
    }

    this.ghostVertex.visible(false)
    this.ghostSplitResult = null
    this.layer.batchDraw()
  }

  /** Create point objects for the outer path (for free-edit mode) */
  private createOuterPointObjects(): void {
    if (!this.outerLens) return
    this.destroyOuterPointObjects()

    const idsAtom = this.outerLens.ids()
    const ids = this.registry.get(idsAtom)
    this.outerCurrentIds = ids

    HashSet.forEach(ids, (id) => {
      const objects = this.createPointObjectsForLens(id, this.outerLens!)
      this.outerPointObjects = HashMap.set(this.outerPointObjects, id, objects)
    })

    // Subscribe to outer ids for structural changes
    this.unsubscribeOuterIds = this.registry.subscribe(idsAtom, (newIds) => {
      const oldIds = this.outerCurrentIds
      this.outerCurrentIds = newIds

      const removed = HashSet.difference(oldIds, newIds)
      HashSet.forEach(removed, (id) => {
        const entry = HashMap.get(this.outerPointObjects, id)
        if (entry._tag === "Some") {
          entry.value.unsubscribe()
          entry.value.group.destroy()
          this.outerPointObjects = HashMap.remove(this.outerPointObjects, id)
        }
      })

      const added = HashSet.difference(newIds, oldIds)
      HashSet.forEach(added, (id) => {
        const objects = this.createPointObjectsForLens(id, this.outerLens!)
        this.outerPointObjects = HashMap.set(this.outerPointObjects, id, objects)
      })

      this.layer.batchDraw()
    })
  }

  /** Destroy outer point objects */
  private destroyOuterPointObjects(): void {
    this.unsubscribeOuterIds?.()
    this.unsubscribeOuterIds = null
    HashMap.forEach(this.outerPointObjects, (objects) => {
      objects.unsubscribe()
      objects.group.destroy()
    })
    this.outerPointObjects = HashMap.empty()
    this.outerCurrentIds = HashSet.empty()
  }

  /** Create point objects for a given lens (shared by inner and outer) */
  private createPointObjectsForLens(id: string, targetLens: YLinkedListLens<BezierPointData>): PointObjects {
    const nodeLens = targetLens.find(id)
    const group = new Konva.Group({ visible: this.active })

    const handleInLine = new Konva.Line({
      points: [0, 0, 0, 0], stroke: HANDLE_LINE_COLOR,
      strokeWidth: tokens.canvas.guideStrokeWidth, visible: false,
    })
    const handleInCircle = new Konva.Circle({
      radius: HANDLE_RADIUS, fill: HANDLE_COLOR,
      draggable: true, visible: false, hitStrokeWidth: HANDLE_HIT_BUFFER,
    })
    const handleOutLine = new Konva.Line({
      points: [0, 0, 0, 0], stroke: HANDLE_LINE_COLOR,
      strokeWidth: tokens.canvas.guideStrokeWidth, visible: false,
    })
    const handleOutCircle = new Konva.Circle({
      radius: HANDLE_RADIUS, fill: HANDLE_COLOR,
      draggable: true, visible: false, hitStrokeWidth: HANDLE_HIT_BUFFER,
    })
    const pointCircle = new Konva.Circle({
      radius: POINT_RADIUS, fill: POINT_COLOR,
      stroke: tokens.color.canvas.vertexStroke,
      strokeWidth: tokens.canvas.pointStrokeWidth,
      draggable: true, hitStrokeWidth: POINT_HIT_BUFFER,
    })

    group.add(handleInLine, handleInCircle, handleOutLine, handleOutCircle, pointCircle)
    this.layer.add(group)

    // Drag handlers
    pointCircle.on("dragmove", () => {
      nodeLens.focus("x").syncSet(pointCircle.x())
      nodeLens.focus("y").syncSet(pointCircle.y())
    })
    handleInCircle.on("dragmove", () => {
      const data = nodeLens.syncGet()
      if (!data) return
      const polar = cartesianToPolar(data.x, data.y, handleInCircle.x(), handleInCircle.y())
      nodeLens.focus("handleInAngle").syncSet(polar.angle)
      nodeLens.focus("handleInDistance").syncSet(polar.distance)
    })
    handleOutCircle.on("dragmove", () => {
      const data = nodeLens.syncGet()
      if (!data) return
      const polar = cartesianToPolar(data.x, data.y, handleOutCircle.x(), handleOutCircle.y())
      nodeLens.focus("handleOutAngle").syncSet(polar.angle)
      nodeLens.focus("handleOutDistance").syncSet(polar.distance)
    })

    handleInCircle.on("pointerdown", (e) => { e.cancelBubble = true })
    handleOutCircle.on("pointerdown", (e) => { e.cancelBubble = true })

    // Hover states
    pointCircle.on("pointerenter", () => { pointCircle.fill(POINT_COLOR_HOVER); this.layer.batchDraw() })
    pointCircle.on("pointerleave", () => { pointCircle.fill(POINT_COLOR); this.layer.batchDraw() })
    handleInCircle.on("pointerenter", () => { handleInCircle.fill(HANDLE_COLOR_HOVER); this.layer.batchDraw() })
    handleInCircle.on("pointerleave", () => { handleInCircle.fill(HANDLE_COLOR); this.layer.batchDraw() })
    handleOutCircle.on("pointerenter", () => { handleOutCircle.fill(HANDLE_COLOR_HOVER); this.layer.batchDraw() })
    handleOutCircle.on("pointerleave", () => { handleOutCircle.fill(HANDLE_COLOR); this.layer.batchDraw() })

    // Reactive update
    const nodeAtom = nodeLens.atom()
    const initialData = this.registry.get(nodeAtom)
    if (initialData) {
      this.updatePointKonva(initialData, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
    }

    const unsubscribe = this.registry.subscribe(nodeAtom, (data) => {
      if (!data) return
      this.updatePointKonva(data, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
      this.layer.batchDraw()
    })

    const result = { group, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle, unsubscribe }
    if (this.currentZoom !== 1) {
      this.applyInverseScale(result, 1 / this.currentZoom)
    }
    return result
  }

  setBufferDistance(distance: number): void {
    this.bufferDistance = distance
    if (this.outerMode === "uniform" && this.isClosed) {
      this.updatePathLine()
    }
  }

  setOuterMode(mode: "uniform" | "free"): void {
    this.outerMode = mode
    if (mode === "uniform" && this.isClosed) {
      this.updatePathLine()
    }
  }

  /** Apply fill color to the path if closed, clear if open */
  private applyFill(): void {
    if (this.isClosed && this.fillColor && this.fillOpacity > 0) {
      this.pathLine.fill(this.fillColor)
      this.pathLine.opacity(this.fillOpacity)
    } else {
      this.pathLine.fill("")
      this.pathLine.opacity(1)
    }
  }

  /** Subscribe to ids() atom — diff to create/destroy Konva objects */
  private startStructuralLoop(): void {
    const idsAtom = this.lens.ids()
    bpLog.info("startStructuralLoop: subscribing to ids atom")

    this.unsubscribeIds = this.registry.subscribe(idsAtom, (newIds) => {
      bpLog.withContext({ count: HashSet.size(newIds), oldCount: HashSet.size(this.currentIds) }).info("ids changed")
      const oldIds = this.currentIds
      this.currentIds = newIds
      this.syncPointObjects(oldIds, newIds)
    }, { immediate: true })
  }

  /** Subscribe to the whole list atom to rebuild SVG path on any change */
  private startPathRenderLoop(): void {
    const listAtom = this.lens.atom()
    bpLog.info("startPathRenderLoop: subscribing to list atom")

    this.unsubscribeList = this.registry.subscribe(listAtom, (points) => {
      bpLog.withContext({ pointCount: Array.isArray(points) ? points.length : "unknown" }).info("list changed, updating path line")
      this.updatePathLine()
    }, { immediate: true })
  }

  private startOuterRenderLoop(): void {
    if (!this.outerLens) return
    const outerAtom = this.outerLens.atom()
    this.unsubscribeOuterList = this.registry.subscribe(outerAtom, () => {
      if (this.outerMode !== "free" || !this.outerLens) return
      const outerPoints = this.outerLens.get()
      const outerSvg = buildSvgPathData(outerPoints)
      this.outerPathLine.data(outerSvg)
      this.layer.batchDraw()
    }, { immediate: true })
  }

  /** Diff old vs new IDs, create/destroy point Konva objects */
  private syncPointObjects(
    oldIds: HashSet.HashSet<string>,
    newIds: HashSet.HashSet<string>
  ): void {
    // Removed IDs
    const removed = HashSet.difference(oldIds, newIds)
    HashSet.forEach(removed, (id) => {
      const entry = HashMap.get(this.pointObjects, id)
      if (entry._tag === "Some") {
        entry.value.unsubscribe()
        entry.value.group.destroy()
        this.pointObjects = HashMap.remove(this.pointObjects, id)
      }
    })

    // Added IDs
    const added = HashSet.difference(newIds, oldIds)
    HashSet.forEach(added, (id) => {
      const objects = this.createPointObjects(id)
      this.pointObjects = HashMap.set(this.pointObjects, id, objects)
    })

    this.layer.batchDraw()
  }

  /** Create Konva objects for a single point and subscribe to its atom */
  private createPointObjects(id: string): PointObjects {
    const nodeLens = this.lens.find(id)
    const group = new Konva.Group({ visible: this.active })

    // Handle-in line
    const handleInLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: HANDLE_LINE_COLOR,
      strokeWidth: tokens.canvas.guideStrokeWidth,
      visible: false,
    })

    // Handle-in circle
    const handleInCircle = new Konva.Circle({
      radius: HANDLE_RADIUS,
      fill: HANDLE_COLOR,
      draggable: true,
      visible: false,
      hitStrokeWidth: HANDLE_HIT_BUFFER,
    })

    // Handle-out line
    const handleOutLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: HANDLE_LINE_COLOR,
      strokeWidth: tokens.canvas.guideStrokeWidth,
      visible: false,
    })

    // Handle-out circle
    const handleOutCircle = new Konva.Circle({
      radius: HANDLE_RADIUS,
      fill: HANDLE_COLOR,
      draggable: true,
      visible: false,
      hitStrokeWidth: HANDLE_HIT_BUFFER,
    })

    // Point circle (on top)
    const pointCircle = new Konva.Circle({
      radius: POINT_RADIUS,
      fill: POINT_COLOR,
      stroke: tokens.color.canvas.vertexStroke,
      strokeWidth: tokens.canvas.pointStrokeWidth,
      draggable: true,
      hitStrokeWidth: POINT_HIT_BUFFER,
    })

    group.add(handleInLine, handleInCircle, handleOutLine, handleOutCircle, pointCircle)
    this.layer.add(group)

    // --- Drag handlers (user -> Yjs) ---

    pointCircle.on("dragmove", () => {
      const x = pointCircle.x()
      const y = pointCircle.y()
      nodeLens.focus("x").syncSet(x)
      nodeLens.focus("y").syncSet(y)
      // Verify the write persisted into the lens
      const readback = nodeLens.syncGet()
      const match = readback?.x === x && readback?.y === y
      bpLog.withContext({ id, w: `${x},${y}`, r: `${readback?.x},${readback?.y}`, match }).debug("drag")
    })

    handleInCircle.on("dragmove", () => {
      const data = nodeLens.syncGet()
      if (!data) return
      const polar = cartesianToPolar(data.x, data.y, handleInCircle.x(), handleInCircle.y())
      nodeLens.focus("handleInAngle").syncSet(polar.angle)
      nodeLens.focus("handleInDistance").syncSet(polar.distance)
    })

    handleOutCircle.on("dragmove", () => {
      const data = nodeLens.syncGet()
      if (!data) return
      const polar = cartesianToPolar(data.x, data.y, handleOutCircle.x(), handleOutCircle.y())
      nodeLens.focus("handleOutAngle").syncSet(polar.angle)
      nodeLens.focus("handleOutDistance").syncSet(polar.distance)
    })

    // Prevent handle pointerdown from bubbling to stage (avoid adding points when dragging handles)
    // Note: pointCircle does NOT cancel bubble — the stage handler needs to see clicks
    // on the first point to close the path during drawing mode.
    handleInCircle.on("pointerdown", (e) => { e.cancelBubble = true })
    handleOutCircle.on("pointerdown", (e) => { e.cancelBubble = true })

    // Hover states
    pointCircle.on("pointerenter", () => {
      pointCircle.fill(POINT_COLOR_HOVER)
      const s = this.layer.getStage()
      if (s) s.container().style.cursor = "move"
      this.layer.batchDraw()
    })
    pointCircle.on("pointerleave", () => {
      pointCircle.fill(POINT_COLOR)
      const s = this.layer.getStage()
      if (s) s.container().style.cursor = "default"
      this.layer.batchDraw()
    })

    handleInCircle.on("pointerenter", () => {
      handleInCircle.fill(HANDLE_COLOR_HOVER)
      const s = this.layer.getStage()
      if (s) s.container().style.cursor = "move"
      this.layer.batchDraw()
    })
    handleInCircle.on("pointerleave", () => {
      handleInCircle.fill(HANDLE_COLOR)
      const s = this.layer.getStage()
      if (s) s.container().style.cursor = "default"
      this.layer.batchDraw()
    })

    handleOutCircle.on("pointerenter", () => {
      handleOutCircle.fill(HANDLE_COLOR_HOVER)
      const s = this.layer.getStage()
      if (s) s.container().style.cursor = "move"
      this.layer.batchDraw()
    })
    handleOutCircle.on("pointerleave", () => {
      handleOutCircle.fill(HANDLE_COLOR)
      const s = this.layer.getStage()
      if (s) s.container().style.cursor = "default"
      this.layer.batchDraw()
    })

    // --- Reactive update (Yjs -> Konva) ---

    const nodeAtom = nodeLens.atom()
    const initialData = this.registry.get(nodeAtom)
    bpLog.withContext({ id, hasInitialData: !!initialData, x: initialData?.x, y: initialData?.y }).debug("createPointObjects initial data")
    if (initialData) {
      this.updatePointKonva(initialData, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
    }

    const unsubscribe = this.registry.subscribe(nodeAtom, (data) => {
      if (!data) return
      this.updatePointKonva(data, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
      this.layer.batchDraw()
    })

    const result = {
      group, pointCircle,
      handleInLine, handleInCircle,
      handleOutLine, handleOutCircle,
      unsubscribe,
    }

    // Apply current zoom scale immediately
    if (this.currentZoom !== 1) {
      this.applyInverseScale(result, 1 / this.currentZoom)
    }

    return result
  }

  /** Update Konva objects from point data */
  private updatePointKonva(
    data: BezierPointData,
    pointCircle: Konva.Circle,
    handleInLine: Konva.Line,
    handleInCircle: Konva.Circle,
    handleOutLine: Konva.Line,
    handleOutCircle: Konva.Circle,
  ): void {
    pointCircle.position({ x: data.x, y: data.y })

    // Handle-in
    if (data.handleInDistance > 0) {
      const hIn = polarToCartesian(data.x, data.y, data.handleInAngle, data.handleInDistance)
      handleInCircle.position(hIn)
      handleInLine.points([data.x, data.y, hIn.x, hIn.y])
      handleInCircle.visible(true)
      handleInLine.visible(true)
    } else {
      handleInCircle.visible(false)
      handleInLine.visible(false)
    }

    // Handle-out
    if (data.handleOutDistance > 0) {
      const hOut = polarToCartesian(data.x, data.y, data.handleOutAngle, data.handleOutDistance)
      handleOutCircle.position(hOut)
      handleOutLine.points([data.x, data.y, hOut.x, hOut.y])
      handleOutCircle.visible(true)
      handleOutLine.visible(true)
    } else {
      handleOutCircle.visible(false)
      handleOutLine.visible(false)
    }
  }

  /** Rebuild SVG path data from all points */
  private updatePathLine(): void {
    const points = this.lens.get()
    const svgData = buildSvgPathData(points)
    this.pathLine.data(svgData)
    // Detect closed path and update fill
    const wasClosed = this.isClosed
    this.isClosed = svgData.includes("Z")
    if (this.isClosed !== wasClosed) {
      this.applyFill()
    }
    if (this.isClosed && this.outerLens) {
      if (this.outerMode === "uniform") {
        const outerPoints = computeOuterPath(points, this.bufferDistance)
        // Remove existing outer points (YLinkedList has no clear method)
        while (this.outerLens.length() > 0) {
          this.outerLens.removeAt(0)
        }
        for (const pt of outerPoints) {
          this.outerLens.append(pt)
        }
      }
      const outerPoints = this.outerLens.get()
      const outerSvg = buildSvgPathData(outerPoints)
      this.outerPathLine.data(outerSvg)
      this.outerPathLine.visible(true)
    } else {
      this.outerPathLine.visible(false)
    }
    this.layer.batchDraw()
  }

  /** Insert a new point using the cached ghost vertex split result */
  private insertPointFromGhost(): void {
    const result = this.ghostSplitResult
    if (!result) return

    const nodesMap = this.lens.nodes()
    const ids = Array.from(nodesMap.keys())

    // Update the neighbor handles
    const prevLens = this.lens.find(result.afterId)
    prevLens.focus("handleOutAngle").syncSet(result.updatedPrevHandleOut.angle)
    prevLens.focus("handleOutDistance").syncSet(result.updatedPrevHandleOut.distance)

    const afterIdx = ids.indexOf(result.afterId)
    if (afterIdx >= 0 && afterIdx < ids.length - 1) {
      const nextId = ids[afterIdx + 1]
      const nextLens = this.lens.find(nextId)
      nextLens.focus("handleInAngle").syncSet(result.updatedNextHandleIn.angle)
      nextLens.focus("handleInDistance").syncSet(result.updatedNextHandleIn.distance)
    }

    this.lens.insertAfter(result.afterId, result.point)

    // Clear ghost state
    this.ghostVertex.visible(false)
    this.ghostSplitResult = null
  }

  /** Get all points in the path */
  getPoints(): ReadonlyArray<BezierPointData> {
    return this.lens.get()
  }

  /** Append a new point at the end of the path */
  appendPoint(x: number, y: number): string {
    bpLog.withContext({ x, y, currentLength: this.lens.length() }).info("appendPoint called")
    const id = this.lens.append({
      x, y,
      handleInAngle: 0, handleInDistance: 0,
      handleOutAngle: 0, handleOutDistance: 0,
    })
    bpLog.withContext({ id, newLength: this.lens.length() }).info("appendPoint result")
    return id
  }

  /** Clean up all subscriptions and Konva objects */
  dispose(): void {
    this.unsubscribeIds?.()
    this.unsubscribeList?.()

    HashMap.forEach(this.pointObjects, (objects) => {
      objects.unsubscribe()
      objects.group.destroy()
    })
    this.pointObjects = HashMap.empty()

    this.destroyOuterPointObjects()
    this.ghostVertex.destroy()
    this.unsubscribeOuterList?.()
    this.outerPathLine.destroy()
    this.pathLine.destroy()
    this.registry.dispose()
  }
}
