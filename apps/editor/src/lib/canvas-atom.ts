import Konva from "konva"
import { Atom, Result } from "@effect-atom/atom"
import * as MutableHashMap from "effect/MutableHashMap"
import { activeEntryAtom, currentFrameAtom } from "./project-doc-atoms"
import { activeToolAtom, activePathIdAtom, activePathIdRawAtom, drawingStateAtom } from "./path-atoms"
import { canvasActor, CanvasEvent } from "./canvas-machine"
import { activeLayerIdAtom, editingPathTargetAtom, setBufferDistanceAtom } from "./layer-atoms"
import { zoomAtom, setZoomAtom, resetViewSignalAtom } from "./viewport-atoms"
import { visibleMasksAtom, type MaskSpec } from "./visible-masks-atom"
import { frameImageAtom } from "./frame-image-cache"
import { PathRenderer } from "./canvas-objects/path-renderer"
import { PathEditor } from "./canvas-objects/path-editor"
import { attachPenTool } from "@nur/pen-tool"
import { appRegistry } from "./atom-registry"
import { stagePositionAtom, stageSizeAtom } from "../components/canvas-minimap"
import { CanvasRulers } from "./canvas-objects/canvas-rulers"
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
  let activeEditorPathKey: string | null = null
  let currentFrameId: string | null = null

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
  let imgX = 0
  let imgY = 0
  let imageUnsubscribe: (() => void) | null = null

  function updateImageTransform() {
    if (!konvaImage) return
    const scale = Math.min(
      stage.width() / currentFrameWidth,
      stage.height() / currentFrameHeight,
    )
    const scaledW = currentFrameWidth * scale
    const scaledH = currentFrameHeight * scale
    imgX = (stage.width() - scaledW) / 2
    imgY = (stage.height() - scaledH) / 2
    konvaImage.width(scaledW)
    konvaImage.height(scaledH)
    konvaImage.x(imgX)
    konvaImage.y(imgY)
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

  /** Diff visible masks — create/dispose renderers as needed */
  function diffRenderers(specs: Record<string, MaskSpec>) {
    // Remove renderers for masks that no longer exist
    const toRemove: string[] = []
    MutableHashMap.forEach(paths, (_renderer, key) => {
      if (!(key in specs)) toRemove.push(key)
    })
    for (const key of toRemove) {
      const renderer = MutableHashMap.get(paths, key)
      if (renderer._tag === "Some") {
        if (activeEditor && activeEditorPathKey === key) {
          activeEditor.dispose()
          activeEditor = null
          activeEditorPathKey = null
        }
        renderer.value.dispose()
      }
      MutableHashMap.remove(paths, key)
    }

    // Add renderers for new masks
    for (const [key, spec] of Object.entries(specs)) {
      if (MutableHashMap.has(paths, key)) continue

      const maskLens = (root.focus("layers").focus(spec.layerId) as any)
        .focus("masks").focus(spec.frameId).focus(spec.maskId)
      const innerLens = maskLens.focus("inner")
      const outerLens = maskLens.focus("outer")
      const maskData = maskLens.syncGet()

      const renderer = new PathRenderer(innerLens, pathsLayer, {
        appRegistry,
        layerId: spec.layerId,
        onSelect: () => appRegistry.set(activePathIdRawAtom, key),
        color: spec.color,
        outerLens,
        bufferDistance: maskData?.bufferDistance ?? 20,
        outerMode: maskData?.outerMode ?? "uniform",
        onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
        maskLens,
      })
      MutableHashMap.set(paths, key, renderer)
    }

    // Update currentFrameId from specs
    const firstSpec = Object.values(specs)[0]
    currentFrameId = firstSpec?.frameId ?? null
    rulers.setFrameId(currentFrameId)

    pathsLayer.batchDraw()
    handlesLayer.batchDraw()
  }

  // -- Rulers --
  const rulers = new CanvasRulers({
    stage,
    registry: appRegistry,
    root,
    getFrameOffset: () => ({ x: imgX, y: imgY }),
  })

  // -- Initial frame setup --
  const initialCurrentIdx = (() => {
    const result = appRegistry.get(currentFrameAtom) as any
    return result?._tag === "Success" ? result.value : 0
  })()
  const initialFrame = initialFrames[initialCurrentIdx] ?? initialFrames[0]
  log.withContext({ frameId: initialFrame?.id ?? null, currentIdx: initialCurrentIdx }).info("initial frame setup")
  if (initialFrame) {
    currentFrameWidth = initialFrame.width
    currentFrameHeight = initialFrame.height
    subscribeToFrameImage(initialFrame.contentHash)
  }
  updateImageTransform()

  // -- React to visible mask set changes --
  get.subscribe(visibleMasksAtom, (result) => {
    if (!Result.isSuccess(result)) return
    diffRenderers(result.value)

  })

  // Initial diffRenderers call (get.subscribe may not fire immediately)
  const initialMasks = appRegistry.get(visibleMasksAtom) as any
  if (initialMasks?._tag === "Success") diffRenderers(initialMasks.value)

  // -- React to frame changes for image loading --
  get.subscribe(currentFrameAtom, (currentResult) => {
    const currentIdx = currentResult._tag === "Success" ? currentResult.value : 0
    const rawFramesNow = (root.focus("frames").syncGet() ?? {}) as Record<string, Frame>
    const frames = Object.values(rawFramesNow).sort((a, b) => a.index - b.index)
    const frameData = frames.find((f) => f.index === currentIdx)
    log.withContext({ currentIdx, frameId: frameData?.id ?? null }).info("currentFrame subscription")
    if (frameData) {
      currentFrameWidth = frameData.width
      currentFrameHeight = frameData.height
      subscribeToFrameImage(frameData.contentHash)
    } else {
      subscribeToFrameImage(undefined)
    }
    updateImageTransform()
  })

  // -- React to active path changes — create/dispose PathEditor --
  get.subscribe(activePathIdAtom, (pathIdResult) => {
    const activePathId = pathIdResult._tag === "Success" ? pathIdResult.value : null
    activeEditor?.dispose()
    activeEditor = null
    activeEditorPathKey = null
    if (activePathId) {
      const rendererOption = MutableHashMap.get(paths, activePathId)
      if (rendererOption._tag === "Some") {
        activeEditor = new PathEditor(rendererOption.value, handlesLayer, {
          appRegistry,
          onBufferChange: (dist) => appRegistry.set(setBufferDistanceAtom, dist),
        })
        activeEditorPathKey = activePathId
      }
    }
    handlesLayer.batchDraw()
  })

  // -- React to zoom changes — scale stage --
  get.subscribe(zoomAtom, (zoomResult) => {
    const zoom = zoomResult._tag === "Success" ? zoomResult.value : 1
    const stageW = stage.width()
    const stageH = stage.height()
    stage.scale({ x: zoom, y: zoom })
    stage.offset({
      x: (stageW / 2) * (1 - 1 / zoom),
      y: (stageH / 2) * (1 - 1 / zoom),
    })
    appRegistry.set(stagePositionAtom, { x: stage.x(), y: stage.y() })
    updateImageTransform()
    stage.batchDraw()

  })

  // -- React to view reset signal — center stage --
  get.subscribe(resetViewSignalAtom, () => {
    stage.position({ x: 0, y: 0 })
    stage.offset({ x: 0, y: 0 })
    appRegistry.set(stagePositionAtom, { x: 0, y: 0 })
    stage.batchDraw()

  })

  // -- React to editing target changes (inner/outer) — delegate to active editor --
  get.subscribe(editingPathTargetAtom, (target) => {
    activeEditor?.setEditingTarget(target)
  })

  // -- Attach pen tool --
  const disposePenTool = attachPenTool({
    stage,
    pathsLayer,
    handlesLayer,
    root,
    appRegistry,
    atoms: {
      activeToolAtom,
      drawingStateAtom,
      activeLayerIdAtom,
      zoomAtom,
      activePathIdRawAtom,
      setBufferDistanceAtom,
    },
    canvasActor,
    canvasEvent: { ClosePath: CanvasEvent.ClosePath },
    getCurrentFrameId: () => currentFrameId,
    getActiveEditor: () => activeEditor,
    isPanningOrSpaceHeld: () => spaceHeld || isPanning,
    paths,
    onMaskCreated: (pathKey, renderer, editor) => {
      MutableHashMap.set(paths, pathKey, renderer)
      activeEditor?.dispose()
      activeEditor = editor
      activeEditorPathKey = pathKey
      appRegistry.set(activePathIdRawAtom, pathKey)
    },
    createPathRenderer: (innerLens, opts) => new PathRenderer(innerLens, pathsLayer, opts),
    createPathEditor: (renderer) => new PathEditor(renderer, handlesLayer, {
      appRegistry,
      onBufferChange: (dist: number) => appRegistry.set(setBufferDistanceAtom, dist),
    }),
  })

  // -- Ctrl+scroll zoom on canvas --
  const handleWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const result = appRegistry.get(zoomAtom) as any
    const current = result?._tag === "Success" ? result.value : 1
    const delta = e.deltaY < 0 ? 0.05 : -0.05
    const next = Math.max(0.25, Math.min(4, current + delta))
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
    disposePenTool()
    imageUnsubscribe?.()
    activeEditor?.dispose()
    activeEditor = null
    MutableHashMap.forEach(paths, (renderer) => renderer.dispose())
    MutableHashMap.clear(paths)
    rulers.dispose()
    resizeObserver.disconnect()
    stage.destroy()
  })
}).pipe(Atom.keepAlive)
