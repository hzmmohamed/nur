import Konva from "konva"
import * as MutableHashMap from "effect/MutableHashMap"
import { BezierPath } from "./bezier-curve"
import type { ProjectDocEntry } from "../project-doc-atoms"
import { createModuleLogger } from "../logger"

const olLog = createModuleLogger("paths-overlay")

export class PathsOverlay {
  private readonly layer: Konva.Layer
  private readonly root: ProjectDocEntry["root"]
  private readonly paths = MutableHashMap.empty<string, BezierPath>()
  private currentFrameId: string | null = null
  private activePathId: string | null = null
  private onSelectPath?: (pathId: string) => void

  readonly stage: Konva.Stage

  constructor(
    stage: Konva.Stage,
    root: ProjectDocEntry["root"],
    options?: { onSelectPath?: (pathId: string) => void },
  ) {
    this.root = root
    this.stage = stage
    this.onSelectPath = options?.onSelectPath
    this.layer = new Konva.Layer()
    stage.add(this.layer)
    this.layer.moveToTop()
    olLog.withContext({ layerCount: stage.getLayers().length }).info("PathsOverlay created")
  }

  /** Set which path is active — updates styling on all paths */
  setActivePathId(pathId: string | null): void {
    if (this.activePathId === pathId) return
    this.activePathId = pathId
    MutableHashMap.forEach(this.paths, (bp, id) => {
      bp.setActive(id === pathId)
    })
  }

  /** Switch to a new frame — dispose old paths, create new ones */
  setFrame(frameId: string | null): void {
    if (frameId === this.currentFrameId) return
    this.disposeAllPaths()
    this.currentFrameId = frameId
    if (!frameId) return
    this.syncPaths()
  }

  /** Re-sync paths for current frame (call after creating/deleting a path) */
  syncPaths(): void {
    if (!this.currentFrameId) return

    const frameLens = this.root.focus("frames").focus(this.currentFrameId)
    const frameData = frameLens.syncGet()
    if (!frameData) return

    const pathKeys = Object.keys((frameData as any).paths ?? {})
    const pathKeysSet = new Set(pathKeys)

    // Remove paths that no longer exist
    MutableHashMap.forEach(this.paths, (bp, id) => {
      if (!pathKeysSet.has(id)) {
        bp.dispose()
        MutableHashMap.remove(this.paths, id)
      }
    })

    // Add paths that are new
    for (const pathId of pathKeys) {
      if (MutableHashMap.has(this.paths, pathId)) continue
      const pathLens = (frameLens as any).focus("paths").focus(pathId)
      const bp = new BezierPath(pathLens, this.layer, {
        onSelect: () => this.onSelectPath?.(pathId),
      })
      bp.setActive(pathId === this.activePathId)
      MutableHashMap.set(this.paths, pathId, bp)
    }

    this.layer.moveToTop()
    this.layer.batchDraw()
    olLog.withContext({ pathCount: pathKeys.length, frameId: this.currentFrameId }).info("syncPaths done")
  }

  /** Get a BezierPath instance by ID */
  getPath(pathId: string): BezierPath | undefined {
    const opt = MutableHashMap.get(this.paths, pathId)
    return opt._tag === "Some" ? opt.value : undefined
  }

  /** Create a new path on the current frame, returns the path ID */
  createPath(): string | null {
    if (!this.currentFrameId) return null
    const pathId = crypto.randomUUID()
    const frameLens = this.root.focus("frames").focus(this.currentFrameId)
    const pathLens = (frameLens as any).focus("paths").focus(pathId)
    const bp = new BezierPath(pathLens, this.layer, {
      onSelect: () => this.onSelectPath?.(pathId),
    })
    // New path is active by default, dim all others
    this.setActivePathId(pathId)
    bp.setActive(true)
    MutableHashMap.set(this.paths, pathId, bp)
    this.layer.moveToTop()
    olLog.withContext({ pathId, frameId: this.currentFrameId }).info("createPath done")
    return pathId
  }

  /** Get the Konva layer for external click handling */
  getLayer(): Konva.Layer {
    return this.layer
  }

  private disposeAllPaths(): void {
    MutableHashMap.forEach(this.paths, (bp) => bp.dispose())
    MutableHashMap.clear(this.paths)
  }

  dispose(): void {
    this.disposeAllPaths()
    this.layer.destroy()
  }
}
