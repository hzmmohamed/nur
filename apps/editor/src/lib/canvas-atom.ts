import Konva from "konva"
import { Atom, Result } from "@effect-atom/atom"
import * as MutableHashMap from "effect/MutableHashMap"
import { activeEntryAtom, currentFrameAtom, framesAtom } from "./project-doc-atoms"
import { activeToolAtom, activePathIdAtom, setActivePathIdAtom } from "./path-atoms"
import { activeLayerIdAtom } from "./layer-atoms"
import { zoomAtom, setZoomAtom, resetViewSignalAtom } from "./viewport-atoms"
import { frameImageAtom } from "./frame-image-cache"
import { BezierPath } from "./canvas-objects/bezier-curve"
import { appRegistry } from "./atom-registry"
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

  let konvaImage: Konva.Image | null = null
  const paths = MutableHashMap.empty<string, BezierPath>()
  let currentFrameId: string | null = null

  // -- Pointer gesture state for pen tool --
  let dragOrigin: { x: number; y: number } | null = null
  let newPointId: string | null = null
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
    MutableHashMap.forEach(paths, (bp) => bp.dispose())
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
      currentFrameId = frameId
    }
    if (!frameId) return

    // Read masks from the active layer for this frame
    const activeLayerId = getActiveLayerId()
    if (!activeLayerId) {
      // Preview mode — show all layers' masks (dimmed)
      syncAllLayerPaths(frameId)
    } else {
      // Edit mode — show only active layer's masks
      syncLayerPaths(activeLayerId, frameId)
    }

    pathsLayer.moveToTop()
    pathsLayer.batchDraw()
  }

  function getLayerMasksRecord(layerId: string): Record<string, any> | null {
    try {
      const layerData = (root.focus("layers").focus(layerId) as any).syncGet()
      return layerData?.masks ?? null
    } catch {
      return null
    }
  }

  function syncAllLayerPaths(frameId: string) {
    disposeAllPaths()
    pathsLayer.destroyChildren()

    const layersRecord = (root.focus("layers").syncGet() ?? {}) as Record<string, any>
    for (const [layerId] of Object.entries(layersRecord)) {
      const masksRecord = getLayerMasksRecord(layerId)
      if (!masksRecord || !(frameId in masksRecord)) continue

      const masksLens = (root.focus("layers").focus(layerId) as any).focus("masks").focus(frameId)
      const pathKey = `${layerId}:${frameId}`
      const bp = new BezierPath(masksLens, pathsLayer, {
        onSelect: () => appRegistry.set(setActivePathIdAtom, pathKey),
      })
      bp.setActive(false)
      MutableHashMap.set(paths, pathKey, bp)
    }
  }

  function syncLayerPaths(layerId: string, frameId: string) {
    disposeAllPaths()
    pathsLayer.destroyChildren()

    const masksRecord = getLayerMasksRecord(layerId)
    if (!masksRecord || !(frameId in masksRecord)) return

    const masksLens = (root.focus("layers").focus(layerId) as any).focus("masks").focus(frameId)
    const pathKey = `${layerId}:${frameId}`
    const activePathId = getActivePathId()
    const bp = new BezierPath(masksLens, pathsLayer, {
      onSelect: () => appRegistry.set(setActivePathIdAtom, pathKey),
    })
    bp.setActive(pathKey === activePathId)
    MutableHashMap.set(paths, pathKey, bp)
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

  const initialFrame = initialFrames[0]
  log.withContext({ frameId: initialFrame?.id ?? null }).info("initial frame setup")
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

  // -- React to active path changes --
  get.subscribe(activePathIdAtom, (pathIdResult) => {
    const activePathId = pathIdResult._tag === "Success" ? pathIdResult.value : null
    MutableHashMap.forEach(paths, (bp, id) => {
      bp.setActive(id === activePathId)
    })
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
    stage.batchDraw()
  })

  // -- React to view reset signal — center stage --
  get.subscribe(resetViewSignalAtom, () => {
    stage.position({ x: 0, y: 0 })
    stage.offset({ x: 0, y: 0 })
    stage.batchDraw()
  })

  // -- React to active layer changes — re-sync paths for current frame --
  get.subscribe(activeLayerIdAtom, () => {
    if (currentFrameId) {
      syncPaths(currentFrameId)
    }
  })

  // -- Stage pointer handlers for pen tool --
  stage.on("pointerdown", () => {
    if (spaceHeld || isPanning) return

    const tool = getActiveTool()
    if (tool !== "pen") return

    const activeLayerId = getActiveLayerId()
    if (!activeLayerId || !currentFrameId) return

    const pos = stage.getPointerPosition()
    if (!pos) return

    const pathKey = `${activeLayerId}:${currentFrameId}`
    const masksLens = (root.focus("layers").focus(activeLayerId) as any).focus("masks").focus(currentFrameId)

    // If no BezierPath exists for this layer+frame, create one
    if (!MutableHashMap.has(paths, pathKey)) {
      const bp = new BezierPath(masksLens, pathsLayer, {
        onSelect: () => appRegistry.set(setActivePathIdAtom, pathKey),
      })
      bp.setActive(true)
      MutableHashMap.set(paths, pathKey, bp)
      appRegistry.set(setActivePathIdAtom, pathKey)
      pathsLayer.moveToTop()
    }

    const bp = MutableHashMap.get(paths, pathKey)
    if (bp._tag === "Some") {
      const id = bp.value.appendPoint(pos.x, pos.y)
      dragOrigin = { x: pos.x, y: pos.y }
      newPointId = id
      isDraggingNewHandle = false
    }
  })

  stage.on("pointermove", () => {
    if (!dragOrigin || !newPointId) return

    const pos = stage.getPointerPosition()
    if (!pos) return

    const dx = pos.x - dragOrigin.x
    const dy = pos.y - dragOrigin.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (!isDraggingNewHandle && dist < DRAG_THRESHOLD) return
    isDraggingNewHandle = true

    const activeLayerId = getActiveLayerId()
    if (!activeLayerId || !currentFrameId) return

    const masksLens = (root.focus("layers").focus(activeLayerId) as any).focus("masks").focus(currentFrameId)
    const nodeLens = masksLens.find(newPointId)

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
    stage.position({
      x: stageStartPos.x + dx,
      y: stageStartPos.y + dy,
    })
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
