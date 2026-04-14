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
  getCurrentFrameId: () => string | null
  getActiveEditor: () => any
  isPanningOrSpaceHeld: () => boolean
  paths: MutableHashMap.MutableHashMap<string, any>
  onMaskCreated: (pathKey: string, renderer: any, editor: any) => void
  createPathRenderer: (maskLens: any, layerId: string, onSelect?: () => void) => any
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
    getCurrentFrameId,
    getActiveEditor,
    isPanningOrSpaceHeld,
    paths,
    onMaskCreated,
    createPathRenderer,
    createPathEditor,
  } = ctx

  let activeMaskId: string | null = null

  // -- Helper functions --

  function getActiveTool(): string {
    const result = appRegistry.get(atoms.activeToolAtom) as any
    return result?._tag === "Success" ? result.value : "select"
  }

  function getDrawingState(): string {
    const result = appRegistry.get(atoms.drawingStateAtom) as any
    return result?._tag === "Success" ? result.value : "idle"
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

  /** Ensure a mask + renderer + editor exist for the current drawing session */
  function ensureMask(activeLayerId: string, currentFrameId: string): void {
    if (activeMaskId && MutableHashMap.has(paths, `${activeLayerId}:${currentFrameId}:${activeMaskId}`)) {
      return
    }

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
    const renderer = createPathRenderer(
      maskLens,
      activeLayerId,
      () => appRegistry.set(atoms.activePathIdRawAtom, pathKey),
    )
    const editor = createPathEditor(renderer)
    onMaskCreated(pathKey, renderer, editor)

    pathsLayer.moveToTop()
    handlesLayer.moveToTop()
  }

  // -- Stage pointer handlers --

  const onPointerDown = () => {
    if (isPanningOrSpaceHeld()) return
    if (getActiveTool() !== "pen") return
    if (getDrawingState() !== "drawing") return

    const activeLayerId = getActiveLayerId()
    const currentFrameId = getCurrentFrameId()
    if (!activeLayerId || !currentFrameId) return

    const pos = getStagePointerPosition()
    if (!pos) return

    ensureMask(activeLayerId, currentFrameId)

    const activeEditor = getActiveEditor()
    if (!activeEditor) return

    activeEditor.handlePenDown(pos)
  }

  const onPointerMove = () => {
    const activeEditor = getActiveEditor()
    if (!activeEditor) return

    const pos = getStagePointerPosition()
    if (!pos) return

    activeEditor.handlePenMove(pos)
  }

  const onPointerUp = () => {
    const activeEditor = getActiveEditor()
    if (!activeEditor) return

    activeEditor.handlePenUp()
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
