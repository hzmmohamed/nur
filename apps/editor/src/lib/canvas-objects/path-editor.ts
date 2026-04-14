import Konva from "konva"
import * as HashMap from "effect/HashMap"
import * as HashSet from "effect/HashSet"
import { Registry, Result } from "@effect-atom/atom"
import type { YLinkedListLens } from "effect-yjs"
import { cartesianToPolar, polarToCartesian } from "@/lib/domain/coordinate-utils"
import { findNearestPointOnPath } from "./bezier-math"
import type { BezierPointData } from "./path"
import type { PathRenderer } from "./path-renderer"
import { createModuleLogger } from "../logger"
import { zoomAtom } from "../viewport-atoms"
import { tokens } from "@/tokens"

const log = createModuleLogger("path-editor")

const POINT_RADIUS = tokens.canvas.pointRadius
const HANDLE_RADIUS = tokens.canvas.handleRadius
const POINT_COLOR = tokens.color.canvas.vertex
const HANDLE_COLOR = tokens.color.canvas.handle
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

export interface PathEditorOptions {
  appRegistry?: Registry.Registry
  onBufferChange?: (distance: number) => void
  outerMode?: "uniform" | "free"
  onClosePath?: () => void
}

export class PathEditor {
  private readonly registry: Registry.Registry
  private readonly renderer: PathRenderer
  private readonly handlesLayer: Konva.Layer
  private readonly ghostVertex: Konva.Circle
  private pointObjects: HashMap.HashMap<string, PointObjects> = HashMap.empty()
  private currentIds: HashSet.HashSet<string> = HashSet.empty()
  private outerPointObjects: HashMap.HashMap<string, PointObjects> = HashMap.empty()
  private outerCurrentIds: HashSet.HashSet<string> = HashSet.empty()
  private unsubscribeIds: (() => void) | null = null
  private unsubscribeOuterIds: (() => void) | null = null
  private editingTarget: "inner" | "outer" = "inner"
  private currentZoom = 1
  private ghostSplitResult: ReturnType<typeof findNearestPointOnPath> | null = null
  private unsubscribeApp: (() => void) | null = null
  private readonly onBufferChange?: (distance: number) => void
  private readonly onClosePath?: () => void
  private outerMode: "uniform" | "free"
  // Pen drawing state
  private dragOrigin: { x: number; y: number } | null = null
  private newPointId: string | null = null
  private isDraggingNewHandle = false
  private static readonly DRAG_THRESHOLD = 3

  constructor(
    renderer: PathRenderer,
    handlesLayer: Konva.Layer,
    options?: PathEditorOptions,
  ) {
    this.renderer = renderer
    this.handlesLayer = handlesLayer
    this.registry = Registry.make()
    this.onBufferChange = options?.onBufferChange
    this.onClosePath = options?.onClosePath
    this.outerMode = options?.outerMode ?? "uniform"

    this.ghostVertex = new Konva.Circle({
      radius: POINT_RADIUS,
      fill: POINT_COLOR,
      opacity: tokens.canvas.ghostOpacity,
      visible: false,
      listening: false,
    })
    this.handlesLayer.add(this.ghostVertex)

    this.startStructuralLoop()
    this.startGhostHandlers()
    this.startOuterDragHandler()

    // Self-subscribe to zoom
    if (options?.appRegistry) {
      this.startAppSubscriptions(options.appRegistry)
    }
  }

  private startStructuralLoop(): void {
    const idsAtom = this.renderer.innerLens.ids()
    this.unsubscribeIds = this.registry.subscribe(idsAtom, (newIds) => {
      const oldIds = this.currentIds
      this.currentIds = newIds

      const removed = HashSet.difference(oldIds, newIds)
      HashSet.forEach(removed, (id) => {
        const entry = HashMap.get(this.pointObjects, id)
        if (entry._tag === "Some") {
          entry.value.unsubscribe()
          entry.value.group.destroy()
          this.pointObjects = HashMap.remove(this.pointObjects, id)
        }
      })

      const added = HashSet.difference(newIds, oldIds)
      HashSet.forEach(added, (id) => {
        const objects = this.createPointObjects(id, this.renderer.innerLens)
        this.pointObjects = HashMap.set(this.pointObjects, id, objects)
      })

      this.handlesLayer.batchDraw()
    }, { immediate: true })
  }

  private createPointObjects(
    id: string,
    targetLens: YLinkedListLens<BezierPointData>,
  ): PointObjects {
    const nodeLens = targetLens.find(id)
    const group = new Konva.Group()

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
    this.handlesLayer.add(group)

    // Drag: Konva → Y.Doc
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

    // Hover
    pointCircle.on("pointerenter", () => {
      pointCircle.fill(POINT_COLOR_HOVER)
      const s = this.handlesLayer.getStage()
      if (s) s.container().style.cursor = "move"
      this.handlesLayer.batchDraw()
    })
    pointCircle.on("pointerleave", () => {
      pointCircle.fill(POINT_COLOR)
      const s = this.handlesLayer.getStage()
      if (s) s.container().style.cursor = "default"
      this.handlesLayer.batchDraw()
    })
    handleInCircle.on("pointerenter", () => { handleInCircle.fill(HANDLE_COLOR_HOVER); this.handlesLayer.batchDraw() })
    handleInCircle.on("pointerleave", () => { handleInCircle.fill(HANDLE_COLOR); this.handlesLayer.batchDraw() })
    handleOutCircle.on("pointerenter", () => { handleOutCircle.fill(HANDLE_COLOR_HOVER); this.handlesLayer.batchDraw() })
    handleOutCircle.on("pointerleave", () => { handleOutCircle.fill(HANDLE_COLOR); this.handlesLayer.batchDraw() })

    // Reactive: Y.Doc → Konva
    const nodeAtom = nodeLens.atom()
    const initialData = this.registry.get(nodeAtom)
    if (initialData) {
      this.updatePointKonva(initialData, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
    }
    const unsubscribe = this.registry.subscribe(nodeAtom, (data) => {
      if (!data) return
      this.updatePointKonva(data, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle)
      this.handlesLayer.batchDraw()
    })

    const result = { group, pointCircle, handleInLine, handleInCircle, handleOutLine, handleOutCircle, unsubscribe }
    if (this.currentZoom !== 1) this.applyInverseScale(result, 1 / this.currentZoom)
    return result
  }

  private updatePointKonva(
    data: BezierPointData,
    pointCircle: Konva.Circle,
    handleInLine: Konva.Line,
    handleInCircle: Konva.Circle,
    handleOutLine: Konva.Line,
    handleOutCircle: Konva.Circle,
  ): void {
    pointCircle.position({ x: data.x, y: data.y })

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

  private applyInverseScale(objects: PointObjects, inv: number): void {
    objects.pointCircle.scale({ x: inv, y: inv })
    objects.handleInCircle.scale({ x: inv, y: inv })
    objects.handleOutCircle.scale({ x: inv, y: inv })
  }

  private startGhostHandlers(): void {
    const pathLine = this.renderer.pathLineNode
    pathLine.on("pointermove.editor", () => {
      const stage = this.handlesLayer.getStage()
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return
      const points = this.renderer.getPoints()
      const nodesMap = this.renderer.innerLens.nodes()
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
      this.handlesLayer.batchDraw()
    })
    pathLine.on("pointerleave.editor", () => {
      this.ghostVertex.visible(false)
      this.ghostSplitResult = null
      const s = this.handlesLayer.getStage()
      if (s) s.container().style.cursor = "default"
      this.handlesLayer.batchDraw()
    })
    pathLine.on("pointerdown.editor", (e) => {
      e.cancelBubble = true
      if (this.ghostSplitResult) this.insertPointFromGhost()
    })
  }

  private startOuterDragHandler(): void {
    const outerPath = this.renderer.outerPathLineNode
    let outerDragStart: { x: number; y: number; startBuffer: number } | null = null

    outerPath.on("pointerdown.editor", (e) => {
      if (this.outerMode !== "uniform") return
      e.cancelBubble = true
      const stage = this.handlesLayer.getStage()
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return
      outerDragStart = { x: pos.x, y: pos.y, startBuffer: this.renderer.currentBufferDistance }

      const onMove = () => {
        if (!outerDragStart) return
        const stagePos = stage.getPointerPosition()
        if (!stagePos) return
        const dx = stagePos.x - outerDragStart.x
        const dy = stagePos.y - outerDragStart.y
        const delta = Math.sqrt(dx * dx + dy * dy) * Math.sign(dx + dy)
        const zoom = stage.scaleX() || 1
        const newBuffer = Math.max(2, Math.round(outerDragStart.startBuffer + delta / zoom))
        this.renderer.setBufferDistance(newBuffer)
        this.onBufferChange?.(newBuffer)
      }

      const onUp = () => {
        outerDragStart = null
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    })

    outerPath.on("pointerenter.editor", () => {
      if (this.outerMode === "uniform") {
        const s = this.handlesLayer.getStage()
        if (s) s.container().style.cursor = "ew-resize"
      }
    })
    outerPath.on("pointerleave.editor", () => {
      const s = this.handlesLayer.getStage()
      if (s) s.container().style.cursor = "default"
    })
  }

  private startAppSubscriptions(appRegistry: Registry.Registry): void {
    this.unsubscribeApp = appRegistry.subscribe(zoomAtom, (zoomResult) => {
      const zoom = Result.isSuccess(zoomResult) ? zoomResult.value : 1
      this.updateScale(zoom)
    }, { immediate: true })
  }

  setEditingTarget(target: "inner" | "outer"): void {
    if (this.editingTarget === target) return
    this.editingTarget = target

    if (target === "inner") {
      this.destroyOuterPointObjects()
      HashMap.forEach(this.pointObjects, (objects) => { objects.group.visible(true) })
    } else {
      HashMap.forEach(this.pointObjects, (objects) => { objects.group.visible(false) })
      this.createOuterPointObjects()
    }
    this.ghostVertex.visible(false)
    this.ghostSplitResult = null
    this.handlesLayer.batchDraw()
  }

  private createOuterPointObjects(): void {
    const outerLens = this.renderer.outerLens
    if (!outerLens) return
    this.destroyOuterPointObjects()
    const idsAtom = outerLens.ids()
    const ids = this.registry.get(idsAtom)
    this.outerCurrentIds = ids
    HashSet.forEach(ids, (id) => {
      const objects = this.createPointObjects(id, outerLens)
      this.outerPointObjects = HashMap.set(this.outerPointObjects, id, objects)
    })
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
        const objects = this.createPointObjects(id, outerLens)
        this.outerPointObjects = HashMap.set(this.outerPointObjects, id, objects)
      })
      this.handlesLayer.batchDraw()
    })
  }

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

  private updateScale(zoom: number): void {
    this.currentZoom = zoom
    const inv = 1 / zoom
    HashMap.forEach(this.pointObjects, (objects) => { this.applyInverseScale(objects, inv) })
    HashMap.forEach(this.outerPointObjects, (objects) => { this.applyInverseScale(objects, inv) })
    this.ghostVertex.scale({ x: inv, y: inv })
    this.handlesLayer.batchDraw()
  }

  getPoints(): ReadonlyArray<BezierPointData> {
    return this.renderer.getPoints()
  }

  appendPoint(x: number, y: number): string {
    return this.renderer.appendPoint(x, y)
  }

  /**
   * Handle a pen-tool pointer down in stage-local coordinates.
   * When the path is unclosed: appends a point or closes the path.
   * Returns true if the event was consumed (caller should cancelBubble).
   */
  handlePenDown(pos: { x: number; y: number }): boolean {
    if (this.renderer.isClosed) return false

    const points = this.renderer.getPoints()

    // Close detection: click near first point with 3+ existing points
    const closeThreshold = Math.max(10, 15 / this.currentZoom)
    if (points.length >= 3) {
      const first = points[0]
      const dx = pos.x - first.x
      const dy = pos.y - first.y
      if (Math.sqrt(dx * dx + dy * dy) < closeThreshold) {
        this.appendPoint(first.x, first.y)
        this.dragOrigin = null
        this.newPointId = null
        this.onClosePath?.()
        return true
      }
    }

    // Skip if clicking on an existing point
    if (points.length > 0) {
      const hitThreshold = 8 / this.currentZoom
      const nearExisting = points.some((pt) => {
        const dx = pos.x - pt.x
        const dy = pos.y - pt.y
        return Math.sqrt(dx * dx + dy * dy) < hitThreshold
      })
      if (nearExisting) return false
    }

    const id = this.appendPoint(pos.x, pos.y)
    this.dragOrigin = { x: pos.x, y: pos.y }
    this.newPointId = id
    this.isDraggingNewHandle = false
    return true
  }

  /**
   * Handle pointer move during pen drawing (drag to create handles).
   * Only active after handlePenDown placed a new point.
   */
  handlePenMove(pos: { x: number; y: number }): void {
    if (!this.dragOrigin || !this.newPointId) return

    const dx = pos.x - this.dragOrigin.x
    const dy = pos.y - this.dragOrigin.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (!this.isDraggingNewHandle && dist < PathEditor.DRAG_THRESHOLD) return
    this.isDraggingNewHandle = true

    const nodeLens = this.renderer.innerLens.find(this.newPointId)
    const angle = Math.atan2(dy, dx)
    nodeLens.focus("handleOutAngle").syncSet(angle)
    nodeLens.focus("handleOutDistance").syncSet(dist)
    nodeLens.focus("handleInAngle").syncSet(angle + Math.PI)
    nodeLens.focus("handleInDistance").syncSet(dist)
  }

  /** Handle pointer up — end handle drag. */
  handlePenUp(): void {
    this.dragOrigin = null
    this.newPointId = null
    this.isDraggingNewHandle = false
  }

  insertPointFromGhost(): void {
    const result = this.ghostSplitResult
    if (!result) return
    const nodesMap = this.renderer.innerLens.nodes()
    const ids = Array.from(nodesMap.keys())
    const prevLens = this.renderer.innerLens.find(result.afterId)
    prevLens.focus("handleOutAngle").syncSet(result.updatedPrevHandleOut.angle)
    prevLens.focus("handleOutDistance").syncSet(result.updatedPrevHandleOut.distance)
    const afterIdx = ids.indexOf(result.afterId)
    if (afterIdx >= 0 && afterIdx < ids.length - 1) {
      const nextId = ids[afterIdx + 1]
      const nextLens = this.renderer.innerLens.find(nextId)
      nextLens.focus("handleInAngle").syncSet(result.updatedNextHandleIn.angle)
      nextLens.focus("handleInDistance").syncSet(result.updatedNextHandleIn.distance)
    }
    this.renderer.innerLens.insertAfter(result.afterId, result.point)
    this.ghostVertex.visible(false)
    this.ghostSplitResult = null
  }

  dispose(): void {
    this.unsubscribeApp?.()
    const pathLine = this.renderer.pathLineNode
    pathLine.off("pointermove.editor")
    pathLine.off("pointerleave.editor")
    pathLine.off("pointerdown.editor")

    const outerPath = this.renderer.outerPathLineNode
    outerPath.off("pointerdown.editor")
    outerPath.off("pointerenter.editor")
    outerPath.off("pointerleave.editor")

    this.unsubscribeIds?.()
    HashMap.forEach(this.pointObjects, (objects) => {
      objects.unsubscribe()
      objects.group.destroy()
    })
    this.pointObjects = HashMap.empty()

    this.destroyOuterPointObjects()
    this.ghostVertex.destroy()
    this.registry.dispose()
    log.info("PathEditor disposed")
  }
}
