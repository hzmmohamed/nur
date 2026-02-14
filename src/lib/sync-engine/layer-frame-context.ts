/**
 * Phase 3: Layer/Frame Context Management
 *
 * This file contains the context management classes:
 * - LayerFrameContext: Manages all synced paths for a specific layer-frame combination
 * - MultiContextCoordinator: Manages multiple LayerFrameContext instances with caching
 */

import { BaseSyncManager, YjsObserverManager } from "./core";
import { SyncedBezierPath } from "./synced-shapes";
import type { VideoEditingProject } from "@/lib/data-model/impl-yjs-v2";
import type { BezierPath } from "@//lib/data-model/types";
import {
  BezierLayer,
  BezierPath as KonvaBezierPath,
} from "@/lib/complex-shapes";

// ============================================================================
// Class 3.1: LayerFrameContext
// ============================================================================

/**
 * Manages all synced paths for a specific layer-frame combination.
 * Handles path creation, deletion, and synchronization with data model.
 */
export class LayerFrameContext extends BaseSyncManager {
  private layerId: string;
  private frameId: string;
  private project: VideoEditingProject;
  private visualLayer: BezierLayer;
  private syncedPaths: Map<string, SyncedBezierPath> = new Map();
  private activePath?: SyncedBezierPath; // Path currently being drawn
  private observerManager: YjsObserverManager;
  private contextObserverId: string;

  constructor(
    layerId: string,
    frameId: string,
    project: VideoEditingProject,
    visualLayer: BezierLayer
  ) {
    super();
    this.layerId = layerId;
    this.frameId = frameId;
    this.project = project;
    this.visualLayer = visualLayer;
    this.observerManager = new YjsObserverManager();
    this.contextObserverId = `context:${layerId}:${frameId}`;
  }

  initialize(): void {
    if (this.isInitialized) return;

    this.initializeFromData();
    this.setupDataObservers();

    this.setInitialized(true);
  }

  destroy(): void {
    if (!this.isInitialized) return;

    // Destroy all synced paths
    for (const [pathId, syncedPath] of this.syncedPaths.entries()) {
      syncedPath.destroy();
      // Also remove visual path from layer
      syncedPath.getVisualPath().getGroup().remove();
    }
    this.syncedPaths.clear();

    // Clear active path
    this.activePath = undefined;

    // Cleanup observers
    this.observerManager.unregisterAll();
    this.cleanup();

    this.setInitialized(false);
  }

  // ========================================================================
  // Initialization from Data
  // ========================================================================

  /**
   * Load all existing paths from data model and create visual representations
   */
  initializeFromData(): void {
    const dataPaths = this.project.getLayerFrameMasks(
      this.layerId,
      this.frameId
    );

    for (const dataPath of dataPaths) {
      this.addPathFromData(dataPath);
    }
  }

  /**
   * Create visual path and synced wrapper from data
   */
  private addPathFromData(dataPath: BezierPath): void {
    // Skip if already exists
    if (this.syncedPaths.has(dataPath.id)) {
      return;
    }

    // Create visual path
    const visualPath = this.createVisualPath(dataPath);

    // Add to layer
    this.visualLayer.add(visualPath);

    // Create synced wrapper
    const syncedPath = new SyncedBezierPath(
      visualPath,
      this.project,
      this.layerId,
      this.frameId,
      dataPath.id,
      this.observerManager
    );

    syncedPath.initialize();

    // Store
    this.syncedPaths.set(dataPath.id, syncedPath);
  }

  /**
   * Create Konva visual path from data model path
   */
  private createVisualPath(dataPath: BezierPath): KonvaBezierPath {
    // Convert data points to visual path constructor format
    const points = dataPath.points.map((point) => ({
      position: point.position,
      handleInAngle: point.handleIn?.angle,
      handleInDistance: point.handleIn?.distance,
      handleOutAngle: point.handleOut?.angle,
      handleOutDistance: point.handleOut?.distance,
    }));

    // Create visual path
    const visualPath = new KonvaBezierPath(
      points,
      dataPath.closed,
      "#000", // Default stroke color - could be from layer metadata
      2, // Default stroke width
      undefined // No fill by default
    );

    // Set visibility
    if (!dataPath.visible) {
      visualPath.getGroup().hide();
    }

    return visualPath;
  }

  // ========================================================================
  // Path Operations
  // ========================================================================

  /**
   * Start drawing a new path
   * @param pathData Optional initial path data
   * @returns The synced path wrapper
   */
  startDrawingPath(pathData?: Partial<BezierPath>): SyncedBezierPath {
    // Cancel any existing active path
    if (this.activePath) {
      this.cancelDrawingPath();
    }

    // Create path in data model
    const pathId = pathData?.id || crypto.randomUUID();
    const success = this.project.addPathToLayerFrame(
      this.layerId,
      this.frameId,
      {
        id: pathId,
        points: [],
        closed: false,
        visible: true,
        ...pathData,
      }
    );

    if (!success) {
      throw new Error("Failed to create path in data model");
    }

    // Get the created path from data
    const dataPaths = this.project.getLayerFrameMasks(
      this.layerId,
      this.frameId
    );
    const dataPath = dataPaths.find((p) => p.id === pathId);

    if (!dataPath) {
      throw new Error("Path not found after creation");
    }

    // Create visual path
    const visualPath = this.createVisualPath(dataPath);
    this.visualLayer.add(visualPath);

    // Create synced wrapper
    const syncedPath = new SyncedBezierPath(
      visualPath,
      this.project,
      this.layerId,
      this.frameId,
      pathId,
      this.observerManager
    );

    syncedPath.initialize();

    // Store
    this.syncedPaths.set(pathId, syncedPath);
    this.activePath = syncedPath;

    return syncedPath;
  }

  /**
   * Finish drawing the current path
   * Optionally close the path if it has enough points
   */
  finishDrawingPath(): void {
    if (!this.activePath) {
      return;
    }

    const pathId = this.activePath.getPathId();

    // Optionally close the path if it has 3+ points
    this.project.closePathIfValid(this.layerId, this.frameId, pathId);

    // Clear active path
    this.activePath = undefined;
  }

  /**
   * Cancel drawing and remove the current path
   */
  cancelDrawingPath(): void {
    if (!this.activePath) {
      return;
    }

    const pathId = this.activePath.getPathId();

    // Remove from data model
    this.project.removePath(this.layerId, this.frameId, pathId);

    // Remove from our tracking (observer will handle cleanup)
    this.activePath = undefined;
  }

  /**
   * Remove a path
   * @param pathId The path ID to remove
   * @returns true if path was removed
   */
  removePath(pathId: string): boolean {
    const syncedPath = this.syncedPaths.get(pathId);
    if (!syncedPath) {
      return false;
    }

    // Remove from data model
    const success = this.project.removePath(this.layerId, this.frameId, pathId);

    if (success) {
      // Cleanup will happen via observer
      // But we can also do it immediately
      syncedPath.destroy();
      syncedPath.getVisualPath().getGroup().remove();
      this.syncedPaths.delete(pathId);

      // Clear active if this was the active path
      if (this.activePath?.getPathId() === pathId) {
        this.activePath = undefined;
      }
    }

    return success;
  }

  // ========================================================================
  // Data Observers
  // ========================================================================

  /**
   * Setup observers for path array changes
   */
  private setupDataObservers(): void {
    const layerFrameMasks = this.project.ydoc.getArray("layerFrameMasks");

    const observerCallback = () => {
      if (!this.shouldSync()) return;

      // Get current paths from data
      const dataPaths = this.project.getLayerFrameMasks(
        this.layerId,
        this.frameId
      );

      this.reconcilePaths(dataPaths);
    };

    // Observe deep changes to catch path additions/removals
    layerFrameMasks.observeDeep(observerCallback);

    // Register cleanup
    this.observerManager.register(this.contextObserverId, () => {
      layerFrameMasks.unobserveDeep(observerCallback);
    });

    this.addCleanup(() => {
      this.observerManager.unregister(this.contextObserverId);
    });
  }

  /**
   * Reconcile visual paths with data paths
   * Add missing paths, remove deleted paths
   */
  private reconcilePaths(dataPaths: BezierPath[]): void {
    const dataPathIds = new Set(dataPaths.map((p) => p.id));
    const visualPathIds = new Set(this.syncedPaths.keys());

    // Find paths to add (in data but not in visual)
    for (const dataPath of dataPaths) {
      if (!visualPathIds.has(dataPath.id)) {
        this.addPathFromData(dataPath);
      }
    }

    // Find paths to remove (in visual but not in data)
    for (const pathId of visualPathIds) {
      if (!dataPathIds.has(pathId)) {
        this.onPathRemoved(pathId);
      }
    }
  }

  /**
   * Handle path removed from data
   */
  private onPathRemoved(pathId: string): void {
    const syncedPath = this.syncedPaths.get(pathId);
    if (!syncedPath) {
      return;
    }

    // Destroy and remove visual
    syncedPath.destroy();
    syncedPath.getVisualPath().getGroup().remove();
    this.syncedPaths.delete(pathId);

    // Clear active if this was the active path
    if (this.activePath?.getPathId() === pathId) {
      this.activePath = undefined;
    }
  }

  // ========================================================================
  // Visibility Management
  // ========================================================================

  /**
   * Update visibility of all paths based on layer visibility
   */
  updateVisibility(visible: boolean): void {
    for (const syncedPath of this.syncedPaths.values()) {
      const visualPath = syncedPath.getVisualPath();
      if (visible) {
        visualPath.getGroup().show();
      } else {
        visualPath.getGroup().hide();
      }
    }
  }

  // ========================================================================
  // Getters
  // ========================================================================

  /**
   * Get synced path by ID
   */
  getSyncedPath(pathId: string): SyncedBezierPath | undefined {
    return this.syncedPaths.get(pathId);
  }

  /**
   * Get all synced paths
   */
  getAllSyncedPaths(): SyncedBezierPath[] {
    return Array.from(this.syncedPaths.values());
  }

  /**
   * Get the currently active path (being drawn)
   */
  getActivePath(): SyncedBezierPath | undefined {
    return this.activePath;
  }

  /**
   * Get layer ID
   */
  getLayerId(): string {
    return this.layerId;
  }

  /**
   * Get frame ID
   */
  getFrameId(): string {
    return this.frameId;
  }

  /**
   * Get number of paths in this context
   */
  getPathCount(): number {
    return this.syncedPaths.size;
  }
}

// ============================================================================
// Class 3.2: MultiContextCoordinator
// ============================================================================

/**
 * Manages multiple LayerFrameContext instances with caching.
 * Provides efficient switching between layer-frame combinations.
 */
export class MultiContextCoordinator {
  private project: VideoEditingProject;
  private visualLayer: BezierLayer;
  private contexts: Map<string, LayerFrameContext> = new Map();
  private activeContext?: LayerFrameContext;

  constructor(project: VideoEditingProject, visualLayer: BezierLayer) {
    this.project = project;
    this.visualLayer = visualLayer;
  }

  // ========================================================================
  // Context Management
  // ========================================================================

  /**
   * Get or create context for a layer-frame combination
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @returns The context instance
   */
  getContext(layerId: string, frameId: string): LayerFrameContext {
    const key = this.getContextKey(layerId, frameId);

    let context = this.contexts.get(key);

    if (!context) {
      // Create new context
      context = new LayerFrameContext(
        layerId,
        frameId,
        this.project,
        this.visualLayer
      );
      context.initialize();
      this.contexts.set(key, context);
    }

    return context;
  }

  /**
   * Set the active context (show its paths, hide others)
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @returns The activated context
   */
  setActiveContext(layerId: string, frameId: string): LayerFrameContext {
    const newContext = this.getContext(layerId, frameId);

    // Hide all other contexts
    for (const [key, context] of this.contexts.entries()) {
      if (context !== newContext) {
        context.updateVisibility(false);
      }
    }

    // Show new context
    newContext.updateVisibility(true);

    // Set as active
    this.activeContext = newContext;

    return newContext;
  }

  /**
   * Get the currently active context
   */
  getActiveContext(): LayerFrameContext | undefined {
    return this.activeContext;
  }

  /**
   * Check if a context exists
   */
  hasContext(layerId: string, frameId: string): boolean {
    const key = this.getContextKey(layerId, frameId);
    return this.contexts.has(key);
  }

  // ========================================================================
  // Context Removal
  // ========================================================================

  /**
   * Remove a specific context
   * @param layerId The layer ID
   * @param frameId The frame ID
   */
  removeContext(layerId: string, frameId: string): void {
    const key = this.getContextKey(layerId, frameId);
    const context = this.contexts.get(key);

    if (context) {
      context.destroy();
      this.contexts.delete(key);

      // Clear active if this was the active context
      if (this.activeContext === context) {
        this.activeContext = undefined;
      }
    }
  }

  /**
   * Remove all contexts for a specific layer
   * @param layerId The layer ID
   */
  removeLayerContexts(layerId: string): void {
    const keysToRemove: string[] = [];

    for (const [key, context] of this.contexts.entries()) {
      if (context.getLayerId() === layerId) {
        context.destroy();
        keysToRemove.push(key);

        // Clear active if this was the active context
        if (this.activeContext === context) {
          this.activeContext = undefined;
        }
      }
    }

    for (const key of keysToRemove) {
      this.contexts.delete(key);
    }
  }

  /**
   * Remove all contexts for a specific frame
   * @param frameId The frame ID
   */
  removeFrameContexts(frameId: string): void {
    const keysToRemove: string[] = [];

    for (const [key, context] of this.contexts.entries()) {
      if (context.getFrameId() === frameId) {
        context.destroy();
        keysToRemove.push(key);

        // Clear active if this was the active context
        if (this.activeContext === context) {
          this.activeContext = undefined;
        }
      }
    }

    for (const key of keysToRemove) {
      this.contexts.delete(key);
    }
  }

  /**
   * Remove all contexts
   */
  clearAll(): void {
    for (const context of this.contexts.values()) {
      context.destroy();
    }

    this.contexts.clear();
    this.activeContext = undefined;
  }

  // ========================================================================
  // Garbage Collection
  // ========================================================================

  /**
   * Garbage collect unused contexts
   * @param keepActive Whether to keep the active context
   */
  gc(keepActive: boolean = true): void {
    const contextsToRemove: string[] = [];

    for (const [key, context] of this.contexts.entries()) {
      // Keep active context if requested
      if (keepActive && context === this.activeContext) {
        continue;
      }

      // Keep contexts with paths
      if (context.getPathCount() > 0) {
        continue;
      }

      // Mark for removal
      contextsToRemove.push(key);
    }

    // Remove marked contexts
    for (const key of contextsToRemove) {
      const context = this.contexts.get(key);
      if (context) {
        context.destroy();
        this.contexts.delete(key);
      }
    }
  }

  // ========================================================================
  // Utilities
  // ========================================================================

  /**
   * Generate a unique key for a layer-frame combination
   */
  private getContextKey(layerId: string, frameId: string): string {
    return `${layerId}:${frameId}`;
  }

  /**
   * Get all context keys
   */
  getContextKeys(): string[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Get count of cached contexts
   */
  getContextCount(): number {
    return this.contexts.size;
  }

  /**
   * Get all contexts
   */
  getAllContexts(): LayerFrameContext[] {
    return Array.from(this.contexts.values());
  }
}
