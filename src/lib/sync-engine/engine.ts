/**
 * Phase 6: Public API - BezierSyncEngine
 *
 * High-level API for managing Bezier path synchronization between
 * Konva visual layer and Yjs data model.
 */

import Konva from "konva";
import { BezierLayer } from "@/lib/complex-shapes";
import type { VideoEditingProject } from "@/lib/data-model/impl-yjs-v2";
import type { BezierPath, BezierPoint } from "@/lib/data-model/types";
import {
  LayerFrameContext,
  MultiContextCoordinator,
} from "./layer-frame-context";
import { SyncedBezierPath } from "./synced-shapes";

// ============================================================================
// Types
// ============================================================================

export interface BezierSyncEngineConfig {
  layer: BezierLayer;
  project: VideoEditingProject;
  initialLayerId?: string;
  initialFrameId?: string;
}

export interface PathDrawingOptions {
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  closed?: boolean;
  visible?: boolean;
  name?: string;
}

// ============================================================================
// BezierSyncEngine Class
// ============================================================================

/**
 * High-level API for managing Bezier path synchronization.
 *
 * This is the main entry point for consumers. It provides a clean API
 * for all sync operations and manages the underlying infrastructure.
 *
 * @example
 * ```typescript
 * const engine = new BezierSyncEngine({
 *   layer,
 *   project,
 *   initialLayerId: 'layer1',
 *   initialFrameId: 'frame1'
 * });
 *
 * // Start drawing
 * const path = engine.startDrawingPath();
 *
 * // Add points (via project methods)
 * project.addPointToPath(layerId, frameId, pathId, pointData);
 *
 * // Finish drawing
 * engine.finishDrawingPath();
 *
 * // Switch context
 * engine.setActiveLayerFrame('layer2', 'frame3');
 *
 * // Cleanup
 * engine.destroy();
 * ```
 */
export class BezierSyncEngine {
  private layer: BezierLayer;
  private project: VideoEditingProject;
  private coordinator: MultiContextCoordinator;
  private isPausedState: boolean = false;

  constructor(config: BezierSyncEngineConfig) {
    this.layer = config.layer;
    this.project = config.project;

    // Validate that layer is attached to a stage
    const stage = this.layer.getStage();
    if (!stage) {
      throw new Error(
        "BezierLayer must be added to a Konva.Stage before creating BezierSyncEngine"
      );
    }

    // Initialize coordinator
    this.coordinator = new MultiContextCoordinator(this.project, this.layer);

    // Set initial context if provided
    if (config.initialLayerId && config.initialFrameId) {
      this.setActiveLayerFrame(config.initialLayerId, config.initialFrameId);
    }
  }

  // ========================================================================
  // Context Management
  // ========================================================================

  /**
   * Set the active layer-frame combination
   * This will show paths for this combination and hide others
   *
   * @param layerId The layer ID to activate
   * @param frameId The frame ID to activate
   * @returns The active context
   */
  setActiveLayerFrame(layerId: string, frameId: string): LayerFrameContext {
    const context = this.coordinator.setActiveContext(layerId, frameId);

    // Redraw layer to reflect visibility changes
    this.layer.batchDraw();

    return context;
  }

  /**
   * Get the current active context
   * @returns The active context, or undefined if none set
   */
  getCurrentContext(): LayerFrameContext | undefined {
    return this.coordinator.getActiveContext();
  }

  /**
   * Get a specific context without making it active
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @returns The context (created if doesn't exist)
   */
  getContext(layerId: string, frameId: string): LayerFrameContext {
    return this.coordinator.getContext(layerId, frameId);
  }

  /**
   * Check if a context exists for a layer-frame combination
   */
  hasContext(layerId: string, frameId: string): boolean {
    return this.coordinator.hasContext(layerId, frameId);
  }

  // ========================================================================
  // Path Operations
  // ========================================================================

  /**
   * Start drawing a new path in the current active context
   *
   * @param options Drawing options for the path
   * @returns The synced path wrapper
   * @throws Error if no active context is set
   */
  startDrawingPath(options?: PathDrawingOptions): SyncedBezierPath {
    const context = this.coordinator.getActiveContext();

    if (!context) {
      throw new Error("No active context set. Call setActiveLayerFrame first.");
    }

    const pathData: Partial<BezierPath> = {
      closed: options?.closed ?? false,
      visible: options?.visible ?? true,
      name: options?.name,
    };

    return context.startDrawingPath(pathData);
  }

  /**
   * Finish drawing the current path
   * If the path has 3+ points, it will be closed
   *
   * @throws Error if no active context or no path being drawn
   */
  finishDrawingPath(): void {
    const context = this.coordinator.getActiveContext();

    if (!context) {
      throw new Error("No active context set.");
    }

    context.finishDrawingPath();
    this.layer.batchDraw();
  }

  /**
   * Cancel drawing and remove the current path
   *
   * @throws Error if no active context
   */
  cancelDrawingPath(): void {
    const context = this.coordinator.getActiveContext();

    if (!context) {
      throw new Error("No active context set.");
    }

    context.cancelDrawingPath();
    this.layer.batchDraw();
  }

  /**
   * Get the currently active path being drawn
   * @returns The active path, or undefined if none
   */
  getActivePath(): SyncedBezierPath | undefined {
    const context = this.coordinator.getActiveContext();
    return context?.getActivePath();
  }

  /**
   * Delete a path from the current active context
   *
   * @param pathId The path ID to delete
   * @returns true if deleted successfully
   * @throws Error if no active context
   */
  deletePath(pathId: string): boolean {
    const context = this.coordinator.getActiveContext();

    if (!context) {
      throw new Error("No active context set.");
    }

    const result = context.removePath(pathId);
    this.layer.batchDraw();
    return result;
  }

  /**
   * Get a specific synced path from the current active context
   *
   * @param pathId The path ID
   * @returns The synced path, or undefined if not found
   */
  getSyncedPath(pathId: string): SyncedBezierPath | undefined {
    const context = this.coordinator.getActiveContext();
    return context?.getSyncedPath(pathId);
  }

  /**
   * Get all synced paths in the current active context
   * @returns Array of synced paths
   */
  getAllSyncedPaths(): SyncedBezierPath[] {
    const context = this.coordinator.getActiveContext();
    return context?.getAllSyncedPaths() ?? [];
  }

  // ========================================================================
  // Point Operations (Convenience Methods)
  // ========================================================================

  /**
   * Add a point to a path in the current active context
   *
   * @param pathId The path ID
   * @param point The point data
   * @returns true if added successfully
   * @throws Error if no active context
   */
  addPointToPath(pathId: string, point: BezierPoint): boolean {
    const context = this.coordinator.getActiveContext();

    if (!context) {
      throw new Error("No active context set.");
    }

    return this.project.addPointToPath(
      context.getLayerId(),
      context.getFrameId(),
      pathId,
      point
    );
  }

  /**
   * Update a point in a path in the current active context
   *
   * @param pathId The path ID
   * @param pointIndex The index of the point to update
   * @param updates Partial point updates
   * @returns true if updated successfully
   * @throws Error if no active context
   */
  updatePointInPath(
    pathId: string,
    pointIndex: number,
    updates: Partial<BezierPoint>
  ): boolean {
    const context = this.coordinator.getActiveContext();

    if (!context) {
      throw new Error("No active context set.");
    }

    return this.project.updatePointInPath(
      context.getLayerId(),
      context.getFrameId(),
      pathId,
      pointIndex,
      updates
    );
  }

  /**
   * Remove a point from a path in the current active context
   *
   * @param pathId The path ID
   * @param pointIndex The index of the point to remove
   * @returns true if removed successfully
   * @throws Error if no active context
   */
  removePointFromPath(pathId: string, pointIndex: number): boolean {
    const context = this.coordinator.getActiveContext();

    if (!context) {
      throw new Error("No active context set.");
    }

    return this.project.removePointFromPath(
      context.getLayerId(),
      context.getFrameId(),
      pathId,
      pointIndex
    );
  }

  /**
   * Close a path if it has enough points (3+)
   *
   * @param pathId The path ID
   * @returns true if closed successfully
   * @throws Error if no active context
   */
  closePath(pathId: string): boolean {
    const context = this.coordinator.getActiveContext();

    if (!context) {
      throw new Error("No active context set.");
    }

    return this.project.closePathIfValid(
      context.getLayerId(),
      context.getFrameId(),
      pathId
    );
  }

  // ========================================================================
  // State Management
  // ========================================================================

  /**
   * Pause all synchronization
   * Useful for batch operations to avoid triggering many syncs
   */
  pauseSync(): void {
    this.isPausedState = true;

    // Pause all contexts
    for (const context of this.coordinator.getAllContexts()) {
      context.pause();
    }
  }

  /**
   * Resume synchronization
   */
  resumeSync(): void {
    this.isPausedState = false;

    // Resume all contexts
    for (const context of this.coordinator.getAllContexts()) {
      context.resume();
    }

    // Redraw to apply any queued changes
    this.layer.batchDraw();
  }

  /**
   * Check if sync is currently paused
   */
  isPaused(): boolean {
    return this.isPausedState;
  }

  // ========================================================================
  // Visibility Management
  // ========================================================================

  /**
   * Update visibility of all paths in a specific layer
   *
   * @param layerId The layer ID
   * @param visible Whether paths should be visible
   */
  updateLayerVisibility(layerId: string, visible: boolean): void {
    // Update visibility for all contexts with this layer
    for (const context of this.coordinator.getAllContexts()) {
      if (context.getLayerId() === layerId) {
        context.updateVisibility(visible);
      }
    }

    this.layer.batchDraw();
  }

  /**
   * Update visibility of paths in a specific layer-frame combination
   *
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @param visible Whether paths should be visible
   */
  updateContextVisibility(
    layerId: string,
    frameId: string,
    visible: boolean
  ): void {
    if (this.coordinator.hasContext(layerId, frameId)) {
      const context = this.coordinator.getContext(layerId, frameId);
      context.updateVisibility(visible);
      this.layer.batchDraw();
    }
  }

  // ========================================================================
  // Memory Management
  // ========================================================================

  /**
   * Garbage collect empty contexts
   * @param keepActive Whether to keep the active context (default: true)
   */
  gc(keepActive: boolean = true): void {
    this.coordinator.gc(keepActive);
  }

  /**
   * Remove all contexts for a specific layer
   * Useful when a layer is deleted
   *
   * @param layerId The layer ID
   */
  removeLayerContexts(layerId: string): void {
    this.coordinator.removeLayerContexts(layerId);
    this.layer.batchDraw();
  }

  /**
   * Remove all contexts for a specific frame
   * Useful when a frame is deleted
   *
   * @param frameId The frame ID
   */
  removeFrameContexts(frameId: string): void {
    this.coordinator.removeFrameContexts(frameId);
    this.layer.batchDraw();
  }

  /**
   * Clear all contexts
   */
  clearAllContexts(): void {
    this.coordinator.clearAll();
    this.layer.batchDraw();
  }

  // ========================================================================
  // Information/Debug Methods
  // ========================================================================

  /**
   * Get statistics about the sync engine
   */
  getStats(): {
    contextCount: number;
    totalPathCount: number;
    activeContext: {
      layerId: string;
      frameId: string;
      pathCount: number;
    } | null;
  } {
    const activeContext = this.coordinator.getActiveContext();
    const allContexts = this.coordinator.getAllContexts();

    const totalPathCount = allContexts.reduce(
      (sum, ctx) => sum + ctx.getPathCount(),
      0
    );

    return {
      contextCount: this.coordinator.getContextCount(),
      totalPathCount,
      activeContext: activeContext
        ? {
            layerId: activeContext.getLayerId(),
            frameId: activeContext.getFrameId(),
            pathCount: activeContext.getPathCount(),
          }
        : null,
    };
  }

  /**
   * Get all context keys
   */
  getContextKeys(): string[] {
    return this.coordinator.getContextKeys();
  }

  /**
   * Get the project instance
   */
  getProject(): VideoEditingProject {
    return this.project;
  }

  /**
   * Get the stage instance (retrieved from the layer)
   */
  getStage(): Konva.Stage {
    const stage = this.layer.getStage();
    if (!stage) {
      throw new Error("Layer is no longer attached to a stage");
    }
    return stage;
  }

  /**
   * Get the layer instance
   */
  getLayer(): BezierLayer {
    return this.layer;
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  /**
   * Destroy the sync engine and cleanup all resources
   * This will destroy all contexts and remove all synced paths
   */
  destroy(): void {
    // Clear all contexts (this destroys them)
    this.coordinator.clearAll();

    // Clear references
    this.isPausedState = false;
  }
}