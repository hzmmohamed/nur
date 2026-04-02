import Konva from "konva"
import * as HashMap from "effect/HashMap"
import * as HashSet from "effect/HashSet"
import { Registry } from "@effect-atom/atom"
import type { YLinkedListLens } from "effect-yjs"
import { cartesianToPolar, polarToCartesian } from "@/lib/domain/coordinate-utils"
import { buildSvgPathData, findNearestPointOnPath } from "./bezier-math"
import type { BezierPointData } from "./path"
import { createModuleLogger } from "../logger"

const bpLog = createModuleLogger("bezier-path")

const POINT_RADIUS = 6
const HANDLE_RADIUS = 4
const POINT_COLOR = "#4A90D9"
const HANDLE_COLOR = "#E87D3E"
const PATH_COLOR = "#FFFFFF"
const PATH_COLOR_INACTIVE = "#888888"
const PATH_WIDTH = 2
const PATH_WIDTH_INACTIVE = 1
const HANDLE_LINE_COLOR = "#666666"
const HIT_TOLERANCE = 10
const POINT_COLOR_HOVER = "#6BB0F0"
const HANDLE_COLOR_HOVER = "#F0A060"
const POINT_HIT_BUFFER = 6
const HANDLE_HIT_BUFFER = 6

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

  constructor(lens: YLinkedListLens<BezierPointData>, layer: Konva.Layer, options?: BezierPathOptions) {
    this.lens = lens
    this.layer = layer
    this.registry = Registry.make()
    this.onSelect = options?.onSelect

    // Create the path line (behind everything)
    this.pathLine = new Konva.Path({
      data: "",
      stroke: PATH_COLOR,
      strokeWidth: PATH_WIDTH,
      listening: true,
      hitStrokeWidth: HIT_TOLERANCE * 2,
    })
    this.layer.add(this.pathLine)

    // Ghost vertex for edge-insertion preview
    this.ghostVertex = new Konva.Circle({
      radius: POINT_RADIUS,
      fill: POINT_COLOR,
      opacity: 0.4,
      visible: false,
      listening: false,
    })
    this.layer.add(this.ghostVertex)

    // Path line hover — highlight inactive paths
    this.pathLine.on("pointerenter", () => {
      if (!this.active) {
        this.pathLine.stroke(PATH_COLOR)
        const s = this.layer.getStage()
        if (s) s.container().style.cursor = "pointer"
        this.layer.batchDraw()
      }
    })
    this.pathLine.on("pointerleave", () => {
      if (!this.active) {
        this.pathLine.stroke(PATH_COLOR_INACTIVE)
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
  }

  /** Set active/inactive visual state. Inactive hides points/handles, dims path. */
  setActive(active: boolean): void {
    if (this.active === active) return
    this.active = active
    this.pathLine.stroke(active ? PATH_COLOR : PATH_COLOR_INACTIVE)
    this.pathLine.strokeWidth(active ? PATH_WIDTH : PATH_WIDTH_INACTIVE)
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
      strokeWidth: 1,
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
      strokeWidth: 1,
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
      stroke: "#FFFFFF",
      strokeWidth: 1,
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

    // Prevent pointerdown from bubbling to stage
    pointCircle.on("pointerdown", (e) => { e.cancelBubble = true })
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

    return {
      group, pointCircle,
      handleInLine, handleInCircle,
      handleOutLine, handleOutCircle,
      unsubscribe,
    }
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

    this.ghostVertex.destroy()
    this.pathLine.destroy()
    this.registry.dispose()
  }
}
