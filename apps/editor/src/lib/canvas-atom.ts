import Konva from "konva"
import { Atom, Result } from "@effect-atom/atom"
import * as MutableHashMap from "effect/MutableHashMap"
import { activeEntryAtom, currentFrameAtom, framesAtom } from "./project-doc-atoms"
import { activeToolAtom, activePathIdAtom, setActivePathIdAtom } from "./path-atoms"
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

  function syncPaths(frameId: string | null) {
    if (frameId !== currentFrameId) {
      disposeAllPaths()
      // Remove any orphaned Konva objects from the paths layer
      pathsLayer.destroyChildren()
      currentFrameId = frameId
    }
    if (!frameId) return

    const pathsLens = (root.focus("frames").focus(frameId) as any).focus("paths")
    const pathsRecord = pathsLens.syncGet() ?? {}
    const pathKeys = Object.keys(pathsRecord)
    const pathKeysSet = new Set(pathKeys)

    log.withContext({ frameId, pathKeys, existing: MutableHashMap.size(paths) }).info("syncPaths")

    MutableHashMap.forEach(paths, (bp, id) => {
      if (!pathKeysSet.has(id)) {
        bp.dispose()
        MutableHashMap.remove(paths, id)
      }
    })

    const activePathId = getActivePathId()
    for (const pathId of pathKeys) {
      if (MutableHashMap.has(paths, pathId)) continue
      const pathLens = pathsLens.focus(pathId)
      const bp = new BezierPath(pathLens, pathsLayer, {
        onSelect: () => appRegistry.set(setActivePathIdAtom, pathId),
      })
      bp.setActive(pathId === activePathId)
      MutableHashMap.set(paths, pathId, bp)
    }

    pathsLayer.moveToTop()
    pathsLayer.batchDraw()
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

  // -- Stage click handler --
  stage.on("click", () => {
    const tool = getActiveTool()
    if (tool !== "pen") return

    const pos = stage.getPointerPosition()
    if (!pos) return

    let pathId = getActivePathId()
    if (!pathId) {
      if (!currentFrameId) return
      const pathsLens = (root.focus("frames").focus(currentFrameId) as any).focus("paths")
      pathId = crypto.randomUUID()
      const pathLens = pathsLens.focus(pathId)
      const bp = new BezierPath(pathLens, pathsLayer, {
        onSelect: () => appRegistry.set(setActivePathIdAtom, pathId!),
      })
      bp.setActive(true)
      MutableHashMap.set(paths, pathId, bp)
      appRegistry.set(setActivePathIdAtom, pathId)
      pathsLayer.moveToTop()
    }

    const bp = MutableHashMap.get(paths, pathId)
    if (bp._tag === "Some") {
      bp.value.appendPoint(pos.x, pos.y)
    }
  })

  // -- Cleanup --
  get.addFinalizer(() => {
    log.info("destroying Konva stage")
    imageUnsubscribe?.()
    disposeAllPaths()
    resizeObserver.disconnect()
    stage.destroy()
  })
}).pipe(Atom.keepAlive)
