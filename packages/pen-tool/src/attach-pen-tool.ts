import type Konva from "konva"
import * as MutableHashMap from "effect/MutableHashMap"

export interface PenToolContext {
  stage: Konva.Stage
  pathsLayer: Konva.Layer
  handlesLayer: Konva.Layer
  root: any
  appRegistry: any
  atoms: {
    activeToolAtom: any
    drawingStateAtom: any
    activeLayerIdAtom: any
    zoomAtom: any
    activePathIdRawAtom: any
    setBufferDistanceAtom: any
  }
  canvasActor: { sendSync: (event: any) => void } | null
  canvasEvent: { ClosePath: any }
  getCurrentFrameId: () => string | null
  getActiveEditor: () => any
  isPanningOrSpaceHeld: () => boolean
  paths: MutableHashMap.MutableHashMap<string, any>
  onMaskCreated: (pathKey: string, renderer: any, editor: any) => void
  createPathRenderer: (innerLens: any, opts: any) => any
  createPathEditor: (renderer: any) => any
}

export function attachPenTool(ctx: PenToolContext): () => void {
  const {
    stage,
    pathsLayer,
    handlesLayer,
    root,
    appRegistry,
    atoms,
    canvasActor,
    canvasEvent,
    getCurrentFrameId,
    getActiveEditor,
    isPanningOrSpaceHeld,
    paths,
    onMaskCreated,
    createPathRenderer,
    createPathEditor,
  } = ctx

  // -- Closure state for pen tool --
  let dragOrigin: { x: number; y: number } | null = null
  let newPointId: string | null = null
  let activeMaskId: string | null = null
  let isDraggingNewHandle = false
  const DRAG_THRESHOLD = 3

  // -- Helper functions --

  function getActiveTool(): string {
    const result = appRegistry.get(atoms.activeToolAtom) as any
    return result?._tag === "Success" ? result.value : "select"
  }

  function getDrawingState(): string {
    const result = appRegistry.get(atoms.drawingStateAtom) as any
    return result?._tag === "Success" ? result.value : "idle"
  }

  function getCurrentZoom(): number {
    const r = appRegistry.get(atoms.zoomAtom) as any
    return r?._tag === "Success" ? r.value : 1
  }

  function getActiveLayerId(): string | null {
    const result = appRegistry.get(atoms.activeLayerIdAtom) as any
    return result?._tag === "Success" ? result.value : null
  }

  /** Convert screen pointer position to stage-local coordinates */
  function getStagePointerPosition(): { x: number; y: number } | null {
    const pos = stage.getPointerPosition()
    if (!pos) return null
    const transform = stage.getAbsoluteTransform().copy().invert()
    return transform.point(pos)
  }

  // -- Stage pointer handlers --

  const onPointerDown = () => {
    if (isPanningOrSpaceHeld()) return

    const tool = getActiveTool()
    if (tool !== "pen") return

    // Only add points when actively drawing
    if (getDrawingState() !== "drawing") return

    const activeLayerId = getActiveLayerId()
    const currentFrameId = getCurrentFrameId()
    if (!activeLayerId || !currentFrameId) return

    const pos = getStagePointerPosition()
    if (!pos) return

    // Reuse active mask if one exists, otherwise create a new one
    if (!activeMaskId || !MutableHashMap.has(paths, `${activeLayerId}:${currentFrameId}:${activeMaskId}`)) {
      const layerData = (root.focus("layers").focus(activeLayerId) as any).syncGet()
      const frameMasksLens = (root.focus("layers").focus(activeLayerId) as any).focus("masks").focus(currentFrameId)
      const existingFrameMasks = frameMasksLens.syncGet()
      if (!existingFrameMasks) {
        ;(frameMasksLens as any).syncSet({})
      }
      activeMaskId = crypto.randomUUID()
      const maskLens = frameMasksLens.focus(activeMaskId)
      ;(maskLens as any).syncSet({
        name: null,
        inner: [],
        outer: [],
        bufferDistance: 20,
        outerMode: "uniform",
      })

      const pathKey = `${activeLayerId}:${currentFrameId}:${activeMaskId}`
      const innerLens = maskLens.focus("inner")
      const outerLens = maskLens.focus("outer")
      const renderer = createPathRenderer(innerLens, {
        appRegistry,
        layerId: activeLayerId,
        onSelect: () => appRegistry.set(atoms.activePathIdRawAtom, pathKey),
        color: layerData?.color,
        outerLens,
        bufferDistance: 20,
        outerMode: "uniform",
        onBufferChange: (dist: number) => appRegistry.set(atoms.setBufferDistanceAtom, dist),
        maskLens,
      })
      const editor = createPathEditor(renderer)
      onMaskCreated(pathKey, renderer, editor)

      pathsLayer.moveToTop()
      handlesLayer.moveToTop()
    }

    const activeEditor = getActiveEditor()
    if (!activeEditor) return

    // Check if near the first point (close-ready) — need 3+ existing points
    const points = activeEditor.getPoints()
    const currentZoom = getCurrentZoom()
    const closeThreshold = Math.max(10, 15 / currentZoom)
    if (points.length >= 3) {
      const first = points[0]
      const dx = pos.x - first.x
      const dy = pos.y - first.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < closeThreshold) {
        // Close the path: append a point at exactly the first point's position
        activeEditor.appendPoint(first.x, first.y)
        activeMaskId = null
        canvasActor?.sendSync(canvasEvent.ClosePath)
        return
      }
    }

    // Skip if clicking on an existing point (avoid duplicates)
    if (points.length > 0) {
      const hitThreshold = 8
      const nearExisting = points.some((pt: any) => {
        const dx = pos.x - pt.x
        const dy = pos.y - pt.y
        return Math.sqrt(dx * dx + dy * dy) < hitThreshold
      })
      if (nearExisting) return
    }

    const id = activeEditor.appendPoint(pos.x, pos.y)
    dragOrigin = { x: pos.x, y: pos.y }
    newPointId = id
    isDraggingNewHandle = false
  }

  const onPointerMove = () => {
    if (!dragOrigin || !newPointId) return

    const pos = getStagePointerPosition()
    if (!pos) return

    const dx = pos.x - dragOrigin.x
    const dy = pos.y - dragOrigin.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (!isDraggingNewHandle && dist < DRAG_THRESHOLD) return
    isDraggingNewHandle = true

    const activeLayerId = getActiveLayerId()
    const currentFrameId = getCurrentFrameId()
    if (!activeLayerId || !currentFrameId || !activeMaskId) return

    const maskLens = (root.focus("layers").focus(activeLayerId) as any).focus("masks").focus(currentFrameId).focus(activeMaskId)
    const innerLens = maskLens.focus("inner")
    const nodeLens = innerLens.find(newPointId)

    // handleOut points from origin toward cursor
    const angle = Math.atan2(dy, dx)
    nodeLens.focus("handleOutAngle").syncSet(angle)
    nodeLens.focus("handleOutDistance").syncSet(dist)
    // Mirror: handleIn points opposite direction, same distance
    nodeLens.focus("handleInAngle").syncSet(angle + Math.PI)
    nodeLens.focus("handleInDistance").syncSet(dist)
  }

  const onPointerUp = () => {
    dragOrigin = null
    newPointId = null
    isDraggingNewHandle = false
  }

  // -- Drawing state subscription: reset activeMaskId when exiting drawing mode --
  let prevDrawingState = (() => {
    const result = appRegistry.get(atoms.drawingStateAtom) as any
    return result?._tag === "Success" ? result.value : "idle"
  })()

  const unsubDrawingState = appRegistry.subscribe(atoms.drawingStateAtom, (result: any) => {
    const state = result._tag === "Success" ? result.value : "idle"
    if (prevDrawingState !== "idle" && state === "idle") {
      activeMaskId = null
    }
    prevDrawingState = state
  })

  // -- Attach stage events with .pentool namespace --
  stage.on("pointerdown.pentool", onPointerDown)
  stage.on("pointermove.pentool", onPointerMove)
  stage.on("pointerup.pentool", onPointerUp)

  // -- Return dispose function --
  return () => {
    stage.off("pointerdown.pentool", onPointerDown)
    stage.off("pointermove.pentool", onPointerMove)
    stage.off("pointerup.pentool", onPointerUp)
    unsubDrawingState()
  }
}
