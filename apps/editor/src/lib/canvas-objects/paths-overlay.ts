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
    if (frameId === this.currentFrameId) {
      // Frame hasn't changed but ensure layer stays on top (react-konva may reorder)
      this.layer.moveToTop()
      return
    }
    this.disposeAllPaths()
    this.currentFrameId = frameId
    if (!frameId) return
    this.syncPaths()
  }

  /** Get the paths lens for the current frame */
  private getPathsLens() {
    if (!this.currentFrameId) return null
    return (this.root.focus("frames").focus(this.currentFrameId) as any).focus("paths")
  }

  /** Re-sync paths for current frame */
  syncPaths(): void {
    const pathsLens = this.getPathsLens()
    if (!pathsLens) return

    const pathsRecord = pathsLens.syncGet()
    olLog.withContext({
      frameId: this.currentFrameId,
      pathsRecord: pathsRecord != null ? JSON.stringify(pathsRecord).slice(0, 200) : "null/undefined",
      pathsType: typeof pathsRecord,
      pathsKeys: pathsRecord ? Object.keys(pathsRecord) : [],
    }).info("syncPaths raw data")
    const pathKeys = Object.keys(pathsRecord ?? {})
    olLog.withContext({ frameId: this.currentFrameId, pathKeys }).info("syncPaths")
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
      const pathLens = pathsLens.focus(pathId)
      const bp = new BezierPath(pathLens, this.layer, {
        onSelect: () => this.onSelectPath?.(pathId),
      })
      bp.setActive(pathId === this.activePathId)
      MutableHashMap.set(this.paths, pathId, bp)
    }

    this.layer.moveToTop()
    this.layer.batchDraw()
  }

  /** Get a BezierPath instance by ID */
  getPath(pathId: string): BezierPath | undefined {
    const opt = MutableHashMap.get(this.paths, pathId)
    return opt._tag === "Some" ? opt.value : undefined
  }

  /** Create a new path on the current frame, returns the path ID */
  createPath(): string | null {
    const pathsLens = this.getPathsLens()
    if (!pathsLens) return null

    const pathId = crypto.randomUUID()
    const pathLens = pathsLens.focus(pathId)
    const bp = new BezierPath(pathLens, this.layer, {
      onSelect: () => this.onSelectPath?.(pathId),
    })

    this.setActivePathId(pathId)
    bp.setActive(true)
    MutableHashMap.set(this.paths, pathId, bp)
    this.layer.moveToTop()

    // Verify: read back the paths record after creating the path
    const verifyRecord = pathsLens.syncGet()
    olLog.withContext({
      pathId,
      frameId: this.currentFrameId,
      verifyKeys: verifyRecord ? Object.keys(verifyRecord) : [],
    }).info("createPath done — verify")
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
