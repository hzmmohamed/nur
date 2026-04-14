import Konva from "konva"
import { Atom, Result } from "@effect-atom/atom"
import * as MutableHashMap from "effect/MutableHashMap"
import { activeEntryAtom, currentFrameAtom, framesAtom } from "./project-doc-atoms"
import { activeToolAtom, activePathIdAtom, activePathIdRawAtom, drawingStateAtom } from "./path-atoms"
import { canvasActor, CanvasEvent } from "./canvas-machine"
import { activeLayerIdAtom, currentFrameMaskCountAtom, editingPathTargetAtom, setBufferDistanceAtom } from "./layer-atoms"
import { zoomAtom, setZoomAtom, resetViewSignalAtom } from "./viewport-atoms"
import { frameImageAtom } from "./frame-image-cache"
import { PathRenderer } from "./canvas-objects/path-renderer"
import { PathEditor } from "./canvas-objects/path-editor"
import { appRegistry } from "./atom-registry"
import { stagePositionAtom, stageSizeAtom } from "../components/canvas-minimap"
import { createModuleLogger } from "./logger"
import type { Frame } from "@nur/core"

const log = createModuleLogger("canvas")

// -- Container element atom --

export const canvasContainerAtom = Atom.make<HTMLDivElement | null>(null)

// -- Canvas lifecycle atom --

export const canvasAtom = Atom.make((get) => {
  const container = get(canvasContainerAtom)
  if (!container) return

  const entryResult = get(activeEntryAtom)
  if (!Result.isSuccess(entryResult)) return
  const { root } = entryResult.value

  // Read frames directly from Y.Doc lens (guaranteed synced at this point)
  const rawFrames = (root.focus("frames").syncGet() ?? {}) as Record<string, Frame>
  const initialFrames = Object.values(rawFrames).sort((a, b) => a.index - b.index)
  log.withContext({ frameCount: initialFrames.length }).info("creating Konva stage")

  // -- Create Stage + layers --
  const stage = new Konva.Stage({
    container,
    width: container.clientWidth,
    height: container.clientHeight,
  })
  const imageLayer = new Konva.Layer()
  const pathsLayer = new Konva.Layer()
  stage.add(imageLayer)
  stage.add(pathsLayer)
  const handlesLayer = new Konva.Layer()
  stage.add(handlesLayer)

  let konvaImage: Konva.Image | null = null
  const paths = MutableHashMap.empty<string, PathRenderer>()
  let activeEditor: PathEditor | null = null
  let currentFrameId: string | null = null

  // -- Pointer gesture state for pen tool --
  let dragOrigin: { x: number; y: number } | null = null
  let newPointId: string | null = null
  let activeMaskId: string | null = null
  let isDraggingNewHandle = false
  const DRAG_THRESHOLD = 3

  // -- Pan state --
  let isPanning = false
  let panStart: { x: number; y: number } | null = null
  let stageStartPos: { x: number; y: number } | null = null
  let spaceHeld = false

  // -- Resize observer --
  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const w = Math.floor(entry.contentRect.width)
    const h = Math.floor(entry.contentRect.height)
    stage.width(w)
    stage.height(h)
    appRegistry.set(stageSizeAtom, { w, h })
    updateImageTransform()
  })
  resizeObserver.observe(container)

  // -- Image management --
  let currentFrameWidth = 1
  let currentFrameHeight = 1
  let imageUnsubscribe: (() => void) | null = null

  function updateImageTransform() {
    if (!konvaImage) return
    const scale = Math.min(
      stage.width() / currentFrameWidth,
      stage.height() / currentFrameHeight,
    )
    const scaledW = currentFrameWidth * scale
    const scaledH = currentFrameHeight * scale
    konvaImage.width(scaledW)
    konvaImage.height(scaledH)
    konvaImage.x((stage.width() - scaledW) / 2)
    konvaImage.y((stage.height() - scaledH) / 2)
    imageLayer.batchDraw()
  }

  function setImage(img: HTMLImageElement | undefined) {
    if (konvaImage) {
      konvaImage.destroy()
      konvaImage = null
    }
    if (img) {
      konvaImage = new Konva.Image({ image: img })
      imageLayer.add(konvaImage)
      updateImageTransform()
    }
    imageLayer.batchDraw()
  }

  function subscribeToFrameImage(contentHash: string | undefined) {
    imageUnsubscribe?.()
    imageUnsubscribe = null
    if (!contentHash) {
      setImage(undefined)
      return
    }

    const imgAtom = frameImageAtom(contentHash)
    imageUnsubscribe = appRegistry.subscribe(imgAtom, (result) => {
      if (Result.isSuccess(result)) {
        setImage(result.value)
      }
    }, { immediate: true })
  }

  // -- Path management --

  function disposeAllPaths() {
    activeEditor?.dispose()
    activeEditor = null
    MutableHashMap.forEach(paths, (renderer) => renderer.dispose())
    MutableHashMap.clear(paths)
  }

  function getActiveLayerId(): string | null {
    const result = appRegistry.get(activeLayerIdAtom) as any
    return result?._tag === "Success" ? result.value : null
  }

  function syncPaths(frameId: string | null) {
    if (frameId !== currentFrameId) {
      disposeAllPaths()
      pathsLayer.destroyChildren()
      handlesLayer.destroyChildren()
      currentFrameId = frameId
    }
    if (!frameId) return

    const activeLayerId = getActiveLayerId()
    if (!activeLayerId) {
      syncAllLayerPaths(frameId)
    } else {
      syncLayerPaths(activeLayerId, frameId)
    }

    pathsLayer.moveToTop()
    handlesLayer.moveToTop()
    pathsLayer.batchDraw()
    handlesLayer.batchDraw()
  }

  function getLayerMasksRecord(layerId: string): Record<string, any> | null {
    try {
      const layerData = (root.focus("layers").focus(layerId) as any).syncGet()
      return layerData?.masks ?? null
    } catch {
      return null
    }
  }

  function getFrameMasks(layerId: string, frameId: string): Record<string, any> | null {
    const masksRecord = getLayerMasksRecord(layerId)
    if (!masksRecord || !(frameId in masksRecord)) return null
    return masksRecord[frameId] as Record<string, any> ?? null
  }

  function syncAllLayerPaths(frameId: string) {
    activeEditor?.dispose()
    activeEditor = null
    disposeAllPaths()
    pathsLayer.destroyChildren()
    handlesLayer.destroyChildren()

    const layersRecord = (root.focus("layers").syncGet() ?? {}) as Record<string, any>
    for (const [layerId, layerData] of Object.entries(layersRecord)) {
      const frameMasks = getFrameMasks(layerId, frameId)
      if (!frameMasks) continue
      for (const [maskId, _maskData] of Object.entries(frameMasks)) {
        const maskLens = (root.focus("layers").focus(layerId) as any).focus("masks").focus(frameId).focus(maskId)
        const innerLens = maskLens.focus("inner")
        const outerLens = maskLens.focus("outer")
        const maskData = maskLens.syncGet()
        const pathKey = `${layerId}:${frameId}:${maskId}`
        const renderer = new PathRenderer(innerLens, pathsLayer, {
          onSelect: () => appRegistry.set(activePathIdRawAtom, pathKey),
          color: (layerData as any).color,
          fillOpacity: 0.25,
          outerLens,
          bufferDistance: maskData?.bufferDistance ?? 20,
          outerMode: maskData?.outerMode ?? "uniform",
          maskLens,
        })
        MutableHashMap.set(paths, pathKey, renderer)
      }
    }
  }

  function syncLayerPaths(layerId: string, frameId: string) {
    activeEditor?.dispose()
    activeEditor = null
    disposeAllPaths()
    pathsLayer.destroyChildren()
    handlesLayer.destroyChildren()

    const layerData = (root.focus("layers").focus(layerId) as any).syncGet()
    const layerColor = layerData?.color as string | undefined
    const activePathId = getActivePathId()

    const frameMasks = getFrameMasks(layerId, frameId)
    if (frameMasks) {
      for (const [maskId, _maskData] of Object.entries(frameMasks)) {
        const maskLens = (root.focus("layers").focus(layerId) as any).focus("masks").focus(frameId).focus(maskId)
        const innerLens = maskLens.focus("inner")
        const outerLens = maskLens.focus("outer")
        const maskData = maskLens.syncGet()
        const pathKey = `${layerId}:${frameId}:${maskId}`
        const renderer = new PathRenderer(innerLens, pathsLayer, {
          onSelect: () => appRegistry.set(activePathIdRawAtom, pathKey),
          color: layerColor,
          fillOpacity: 0.35,
          outerLens,
          bufferDistance: maskData?.bufferDistance ?? 20,
          outerMode: maskData?.outerMode ?? "uniform",
          onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
          maskLens,
        })
        MutableHashMap.set(paths, pathKey, renderer)

        if (pathKey === activePathId) {
          activeEditor = new PathEditor(renderer, handlesLayer, {
            onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
          })
          activeEditor.updateScale(getCurrentZoom())
        }
      }
    }

    // Other visible layers' masks (dimmed, fill-only)
    const allLayers = (root.focus("layers").syncGet() ?? {}) as Record<string, any>
    for (const [otherId, otherData] of Object.entries(allLayers)) {
      if (otherId === layerId) continue
      const otherFrameMasks = getFrameMasks(otherId, frameId)
      if (!otherFrameMasks) continue
      for (const [maskId] of Object.entries(otherFrameMasks)) {
        const otherMaskLens = (root.focus("layers").focus(otherId) as any).focus("masks").focus(frameId).focus(maskId)
        const otherInnerLens = otherMaskLens.focus("inner")
        const otherKey = `${otherId}:${frameId}:${maskId}`
        const renderer = new PathRenderer(otherInnerLens, pathsLayer, {
          color: (otherData as any).color,
          fillOpacity: 0.15,
        })
        MutableHashMap.set(paths, otherKey, renderer)
      }
    }
  }

  function getActivePathId(): string | null {
    const result = appRegistry.get(activePathIdAtom) as any
    return result?._tag === "Success" ? result.value : null
  }

  function getActiveTool(): string {
    const result = appRegistry.get(activeToolAtom) as any
    return result?._tag === "Success" ? result.value : "select"
  }

  // -- Initial frame setup from sync'd Y.Doc data --
  function applyFrame(frameData: Frame | undefined) {
    if (frameData) {
      currentFrameWidth = frameData.width
      currentFrameHeight = frameData.height
      subscribeToFrameImage(frameData.contentHash)
      syncPaths(frameData.id)
    } else {
      subscribeToFrameImage(undefined)
      syncPaths(null)
    }
    updateImageTransform()
    pathsLayer.batchDraw()
  }

  const initialCurrentIdx = (() => {
    const result = appRegistry.get(currentFrameAtom) as any
    return result?._tag === "Success" ? result.value : 0
  })()
  const initialFrame = initialFrames[initialCurrentIdx] ?? initialFrames[0]
  log.withContext({ frameId: initialFrame?.id ?? null, currentIdx: initialCurrentIdx }).info("initial frame setup")
  applyFrame(initialFrame)

  // -- React to frame changes going forward --
  get.subscribe(framesAtom, (framesResult) => {
    const frames: Frame[] = framesResult._tag === "Success" ? framesResult.value : []
    const currentResult = appRegistry.get(currentFrameAtom) as any
    const currentIdx = currentResult?._tag === "Success" ? currentResult.value : 0
    const frameData = frames.find((f) => f.index === currentIdx)
    log.withContext({ frameCount: frames.length, currentIdx, frameId: frameData?.id ?? null }).info("frames subscription")
    applyFrame(frameData)
  })

  get.subscribe(currentFrameAtom, (currentResult) => {
    const currentIdx = currentResult._tag === "Success" ? currentResult.value : 0
    const rawFramesNow = (root.focus("frames").syncGet() ?? {}) as Record<string, Frame>
    const frames = Object.values(rawFramesNow).sort((a, b) => a.index - b.index)
    const frameData = frames.find((f) => f.index === currentIdx)
    log.withContext({ currentIdx, frameId: frameData?.id ?? null }).info("currentFrame subscription")
    applyFrame(frameData)
  })

  // -- React to active path changes — create/dispose PathEditor --
  get.subscribe(activePathIdAtom, (pathIdResult) => {
    const activePathId = pathIdResult._tag === "Success" ? pathIdResult.value : null
    activeEditor?.dispose()
    activeEditor = null
    if (activePathId) {
      const rendererOption = MutableHashMap.get(paths, activePathId)
      if (rendererOption._tag === "Some") {
        activeEditor = new PathEditor(rendererOption.value, handlesLayer, {
          onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
        })
        activeEditor.updateScale(getCurrentZoom())
      }
    }
    handlesLayer.batchDraw()
  })

  // -- React to zoom changes — scale stage --
  get.subscribe(zoomAtom, (zoomResult) => {
    const zoom = zoomResult._tag === "Success" ? zoomResult.value : 1
    const stageW = stage.width()
    const stageH = stage.height()
    // Scale from center
    stage.scale({ x: zoom, y: zoom })
    stage.offset({
      x: (stageW / 2) * (1 - 1 / zoom),
      y: (stageH / 2) * (1 - 1 / zoom),
    })
    // Update all paths to compensate for zoom
    MutableHashMap.forEach(paths, (renderer) => renderer.updateScale(zoom))
    activeEditor?.updateScale(zoom)
    appRegistry.set(stagePositionAtom, { x: stage.x(), y: stage.y() })
    stage.batchDraw()
  })

  // -- React to view reset signal — center stage --
  get.subscribe(resetViewSignalAtom, () => {
    stage.position({ x: 0, y: 0 })
    stage.offset({ x: 0, y: 0 })
    appRegistry.set(stagePositionAtom, { x: 0, y: 0 })
    stage.batchDraw()
  })

  // -- React to active layer changes — re-sync paths for current frame --
  get.subscribe(activeLayerIdAtom, () => {
    if (currentFrameId) {
      syncPaths(currentFrameId)
    }
  })

  // -- React to mask count changes — re-sync when masks are added/removed (e.g. copy from previous) --
  get.subscribe(currentFrameMaskCountAtom, () => {
    if (currentFrameId) {
      syncPaths(currentFrameId)
    }
  })

  // -- React to editing target changes (inner/outer) — delegate to active editor --
  get.subscribe(editingPathTargetAtom, (target) => {
    activeEditor?.setEditingTarget(target)
  })

  // -- React to drawing state changes — re-sync when exiting drawing mode (done/discard) --
  let prevDrawingState = getDrawingState()
  get.subscribe(drawingStateAtom, (result) => {
    const state = result._tag === "Success" ? result.value : "idle"
    if (prevDrawingState !== "idle" && state === "idle" && currentFrameId) {
      activeMaskId = null
      syncPaths(currentFrameId)
    }
    prevDrawingState = state
  })

  function getDrawingState(): string {
    const result = appRegistry.get(drawingStateAtom) as any
    return result?._tag === "Success" ? result.value : "idle"
  }

  function getCurrentZoom(): number {
    const r = appRegistry.get(zoomAtom) as any
    return r?._tag === "Success" ? r.value : 1
  }

  /** Convert screen pointer position to stage-local coordinates */
  function getStagePointerPosition(): { x: number; y: number } | null {
    const pos = stage.getPointerPosition()
    if (!pos) return null
    const transform = stage.getAbsoluteTransform().copy().invert()
    return transform.point(pos)
  }

  // -- Stage pointer handlers for pen tool --
  stage.on("pointerdown", () => {
    if (spaceHeld || isPanning) return

    const tool = getActiveTool()
    if (tool !== "pen") return

    // Only add points when actively drawing
    if (getDrawingState() !== "drawing") return

    const activeLayerId = getActiveLayerId()
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
      const renderer = new PathRenderer(innerLens, pathsLayer, {
        onSelect: () => appRegistry.set(activePathIdRawAtom, pathKey),
        color: layerData?.color,
        fillOpacity: 0.35,
        outerLens,
        bufferDistance: 20,
        outerMode: "uniform",
        onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
        maskLens,
      })
      MutableHashMap.set(paths, pathKey, renderer)

      activeEditor?.dispose()
      activeEditor = new PathEditor(renderer, handlesLayer, {
        onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
      })
      activeEditor.updateScale(getCurrentZoom())
      appRegistry.set(activePathIdRawAtom, pathKey)
      pathsLayer.moveToTop()
      handlesLayer.moveToTop()
    }

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
        canvasActor?.sendSync(CanvasEvent.ClosePath)
        return
      }
    }

    // Skip if clicking on an existing point (avoid duplicates)
    if (points.length > 0) {
      const hitThreshold = 8
      const nearExisting = points.some((pt) => {
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
  })

  stage.on("pointermove", () => {
    if (!dragOrigin || !newPointId) return

    const pos = getStagePointerPosition()
    if (!pos) return

    const dx = pos.x - dragOrigin.x
    const dy = pos.y - dragOrigin.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (!isDraggingNewHandle && dist < DRAG_THRESHOLD) return
    isDraggingNewHandle = true

    const activeLayerId = getActiveLayerId()
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
  })

  stage.on("pointerup", () => {
    dragOrigin = null
    newPointId = null
    isDraggingNewHandle = false
  })

  // -- Ctrl+scroll zoom on canvas --
  const handleWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const result = appRegistry.get(zoomAtom) as any
    const current = result?._tag === "Success" ? result.value : 1
    const delta = e.deltaY < 0 ? 0.1 : -0.1
    const next = Math.max(0.1, Math.min(5, current + delta))
    appRegistry.set(setZoomAtom, parseFloat(next.toFixed(2)))
  }
  container.addEventListener("wheel", handleWheel, { passive: false })

  // -- Pan: space+drag or middle mouse drag --
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === " " && !e.repeat) {
      // Skip when typing in an input, textarea, or contenteditable
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      spaceHeld = true
      container.style.cursor = "grab"
    }
  }
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") {
      spaceHeld = false
      if (!isPanning) container.style.cursor = ""
    }
  }
  const handlePanStart = (e: MouseEvent) => {
    // Middle mouse (button 1) or space+left click (button 0)
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault()
      isPanning = true
      panStart = { x: e.clientX, y: e.clientY }
      stageStartPos = { x: stage.x(), y: stage.y() }
      container.style.cursor = "grabbing"
    }
  }
  const handlePanMove = (e: MouseEvent) => {
    if (!isPanning || !panStart || !stageStartPos) return
    const dx = e.clientX - panStart.x
    const dy = e.clientY - panStart.y
    const newPos = {
      x: stageStartPos.x + dx,
      y: stageStartPos.y + dy,
    }
    stage.position(newPos)
    appRegistry.set(stagePositionAtom, newPos)
    stage.batchDraw()
  }
  const handlePanEnd = () => {
    if (!isPanning) return
    isPanning = false
    panStart = null
    stageStartPos = null
    container.style.cursor = spaceHeld ? "grab" : ""
  }

  window.addEventListener("keydown", handleKeyDown)
  window.addEventListener("keyup", handleKeyUp)
  container.addEventListener("mousedown", handlePanStart)
  window.addEventListener("mousemove", handlePanMove)
  window.addEventListener("mouseup", handlePanEnd)

  // -- Cleanup --
  get.addFinalizer(() => {
    log.info("destroying Konva stage")
    container.removeEventListener("wheel", handleWheel)
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("keyup", handleKeyUp)
    container.removeEventListener("mousedown", handlePanStart)
    window.removeEventListener("mousemove", handlePanMove)
    window.removeEventListener("mouseup", handlePanEnd)
    imageUnsubscribe?.()
    disposeAllPaths()
    resizeObserver.disconnect()
    stage.destroy()
  })
}).pipe(Atom.keepAlive)
