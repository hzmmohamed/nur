import Konva from "konva"
import * as MutableHashMap from "effect/MutableHashMap"
import { BezierPath } from "./bezier-curve"
import type { ProjectDocEntry } from "../project-doc-atoms"

export class PathsOverlay {
  private readonly layer: Konva.Layer
  private readonly root: ProjectDocEntry["root"]
  private readonly paths = MutableHashMap.empty<string, BezierPath>()
  private currentFrameId: string | null = null

  constructor(
    stage: Konva.Stage,
    root: ProjectDocEntry["root"],
  ) {
    this.root = root
    this.layer = new Konva.Layer()
    stage.add(this.layer)
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
      const bp = new BezierPath(pathLens, this.layer)
      MutableHashMap.set(this.paths, pathId, bp)
    }

    this.layer.batchDraw()
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
    // Focusing into a new key in a Record auto-creates the Y.Map entry
    const frameLens = this.root.focus("frames").focus(this.currentFrameId)
    ;(frameLens as any).focus("paths").focus(pathId)
    // Sync to pick up the new path
    this.syncPaths()
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
