/**
 * Phase 2: Granular Sync Classes
 *
 * This file contains the fine-grained synchronization classes:
 * - SyncedBezierPointHandle: Syncs a single control handle
 * - SyncedBezierPoint: Syncs an anchor point with its handles
 * - SyncedBezierPath: Syncs entire path with point array reconciliation
 */

import {
  BaseSyncManager,
  YjsObserverManager,
  generateHandleObserverId,
  generatePointObserverId,
  generatePathObserverId,
  type PolarHandle,
} from "./core";
import type { VideoEditingProject } from "@/lib/data-model/impl-yjs-v2";
import type { BezierPoint, BezierPath } from "@/lib/data-model/types";
import type {
  BezierPointHandle,
  BezierPoint as KonvaBezierPoint,
  BezierPath as KonvaBezierPath,
  HandleType,
} from "@/lib/complex-shapes";

// ============================================================================
// Class 2.1: SyncedBezierPointHandle
// ============================================================================

/**
 * Syncs a single control handle between Konva visual and Yjs data model.
 * Handles bidirectional sync with polar coordinates (no conversion needed).
 */
export class SyncedBezierPointHandle extends BaseSyncManager {
  private visualHandle: BezierPointHandle;
  private project: VideoEditingProject;
  private layerId: string;
  private frameId: string;
  private pathId: string;
  private pointIndex: number;
  private handleType: HandleType;
  private observerManager: YjsObserverManager;
  private observerId: string;

  constructor(
    visualHandle: BezierPointHandle,
    project: VideoEditingProject,
    layerId: string,
    frameId: string,
    pathId: string,
    pointIndex: number,
    handleType: HandleType,
    observerManager: YjsObserverManager
  ) {
    super();
    this.visualHandle = visualHandle;
    this.project = project;
    this.layerId = layerId;
    this.frameId = frameId;
    this.pathId = pathId;
    this.pointIndex = pointIndex;
    this.handleType = handleType;
    this.observerManager = observerManager;
    this.observerId = generateHandleObserverId(
      layerId,
      frameId,
      pathId,
      pointIndex,
      handleType
    );
  }

  initialize(): void {
    if (this.isInitialized) return;

    this.setupVisualHandlers();
    this.setupDataObservers();

    // Initial sync: data → visual
    const dataHandle = this.getDataHandle();
    if (dataHandle) {
      this.syncDataToVisual(dataHandle);
    }

    this.setInitialized(true);
  }

  destroy(): void {
    if (!this.isInitialized) return;

    this.observerManager.unregister(this.observerId);
    this.cleanup();
    this.setInitialized(false);
  }

  /**
   * Update the point index (called when points are reordered)
   */
  updatePointIndex(newIndex: number): void {
    if (this.pointIndex === newIndex) return;

    // Unregister old observer
    this.observerManager.unregister(this.observerId);

    // Update index
    this.pointIndex = newIndex;

    // Generate new observer ID
    this.observerId = generateHandleObserverId(
      this.layerId,
      this.frameId,
      this.pathId,
      newIndex,
      this.handleType
    );

    // Re-setup observers with new index
    if (this.isInitialized) {
      this.setupDataObservers();
    }
  }

  // ========================================================================
  // Visual → Data Sync
  // ========================================================================

  private setupVisualHandlers(): void {
    // The visual handle has an onChange callback that we set during construction
    // We need to intercept changes from the visual layer
    // Since BezierPointHandle accepts onChange in constructor, we'll wrap it

    // Note: This assumes we can access or override the onChange callback
    // If not, we may need to modify BezierPointHandle to expose an event system

    // For now, we'll document that the visual handle should be created
    // without an onChange callback, and we'll provide it here

    // Store original onChange if any
    const originalOnChange = (this.visualHandle as any).onChange;

    // TODO: Expose event system instead of this hacky approach
    // Set our sync handler
    (this.visualHandle as any).onChange = () => {
      // Call original if exists
      if (originalOnChange) {
        originalOnChange();
      }

      // Sync to data
      this.syncVisualToData();
    };

    this.addCleanup(() => {
      // Restore original onChange on cleanup
      if (originalOnChange) {
        (this.visualHandle as any).onChange = originalOnChange;
      }
    });
  }

  private syncVisualToData(): void {
    if (!this.shouldSync()) return;

    this.syncGuard.execute(() => {
      const angle = this.visualHandle.getAngle();
      const distance = this.visualHandle.getDistance();

      const polarHandle: PolarHandle = { angle, distance };

      // Update the point in the data model
      const updateData: Partial<BezierPoint> = {
        [this.handleType]: polarHandle,
      };

      this.project.updatePointInPath(
        this.layerId,
        this.frameId,
        this.pathId,
        this.pointIndex,
        updateData
      );
    });
  }

  // ========================================================================
  // Data → Visual Sync
  // ========================================================================

  private setupDataObservers(): void {
    // Observe changes to the specific path in the data model
    const layerFrameMasks = this.project.ydoc.getArray("layerFrameMasks");

    const observerCallback = () => {
      if (!this.shouldSync()) return;

      const dataHandle = this.getDataHandle();
      if (dataHandle !== null) {
        this.syncDataToVisual(dataHandle);
      }
    };

    // Observe deep changes to catch point updates
    layerFrameMasks.observeDeep(observerCallback);

    // Register cleanup
    this.observerManager.register(this.observerId, () => {
      layerFrameMasks.unobserveDeep(observerCallback);
    });

    this.addCleanup(() => {
      this.observerManager.unregister(this.observerId);
    });
  }

  private syncDataToVisual(dataHandle: PolarHandle): void {
    if (!this.shouldSync()) return;

    this.syncGuard.execute(() => {
      // Check if handle actually changed
      const currentAngle = this.visualHandle.getAngle();
      const currentDistance = this.visualHandle.getDistance();

      const currentHandle: PolarHandle = {
        angle: currentAngle,
        distance: currentDistance,
      };

      if (!this.changeDetector.polarHandleChanged(currentHandle, dataHandle)) {
        return; // No meaningful change
      }

      // Update visual handle
      this.visualHandle.setAngleAndDistance(
        dataHandle.angle,
        dataHandle.distance
      );
    });
  }

  // ========================================================================
  // Data Access Helpers
  // ========================================================================

  private getDataHandle(): PolarHandle | null {
    const paths = this.project.getLayerFrameMasks(this.layerId, this.frameId);
    const path = paths.find((p) => p.id === this.pathId);

    if (!path || this.pointIndex >= path.points.length) {
      return null;
    }

    const point = path.points[this.pointIndex];
    return point[this.handleType] || null;
  }
}

// ============================================================================
// Class 2.2: SyncedBezierPoint
// ============================================================================

/**
 * Syncs an anchor point and its two control handles.
 * Coordinates with child SyncedBezierPointHandle instances.
 */
export class SyncedBezierPoint extends BaseSyncManager {
  private visualPoint: KonvaBezierPoint;
  private project: VideoEditingProject;
  private layerId: string;
  private frameId: string;
  private pathId: string;
  private pointIndex: number;
  private handleInSync?: SyncedBezierPointHandle;
  private handleOutSync?: SyncedBezierPointHandle;
  private observerManager: YjsObserverManager;
  private observerId: string;

  constructor(
    visualPoint: KonvaBezierPoint,
    project: VideoEditingProject,
    layerId: string,
    frameId: string,
    pathId: string,
    pointIndex: number,
    observerManager: YjsObserverManager
  ) {
    super();
    this.visualPoint = visualPoint;
    this.project = project;
    this.layerId = layerId;
    this.frameId = frameId;
    this.pathId = pathId;
    this.pointIndex = pointIndex;
    this.observerManager = observerManager;
    this.observerId = generatePointObserverId(
      layerId,
      frameId,
      pathId,
      pointIndex
    );
  }

  initialize(): void {
    if (this.isInitialized) return;

    this.initializeHandles();
    this.setupVisualHandlers();
    this.setupDataObservers();

    // Initial sync: data → visual
    const dataPoint = this.getDataPoint();
    if (dataPoint) {
      this.syncDataToVisual(dataPoint);
    }

    this.setInitialized(true);
  }

  destroy(): void {
    if (!this.isInitialized) return;

    // Destroy child handle syncs
    this.handleInSync?.destroy();
    this.handleOutSync?.destroy();

    this.observerManager.unregister(this.observerId);
    this.cleanup();
    this.setInitialized(false);
  }

  /**
   * Update the point index (called when points are reordered)
   */
  updatePointIndex(newIndex: number): void {
    if (this.pointIndex === newIndex) return;

    // Unregister old observer
    this.observerManager.unregister(this.observerId);

    // Update index
    this.pointIndex = newIndex;

    // Generate new observer ID
    this.observerId = generatePointObserverId(
      this.layerId,
      this.frameId,
      this.pathId,
      newIndex
    );

    // Update child handle indices
    this.handleInSync?.updatePointIndex(newIndex);
    this.handleOutSync?.updatePointIndex(newIndex);

    // Re-setup observers with new index
    if (this.isInitialized) {
      this.setupDataObservers();
    }
  }

  // ========================================================================
  // Handle Initialization
  // ========================================================================

  private initializeHandles(): void {
    // Get visual handles from the point
    // Note: This assumes we can access the private handles from BezierPoint
    // We may need to add getter methods to BezierPoint class

    // For now, we'll document that BezierPoint needs these methods:
    // - getHandleIn(): BezierPointHandle | undefined
    // - getHandleOut(): BezierPointHandle | undefined

    const handleIn = (this.visualPoint as any)._handleIn as
      | BezierPointHandle
      | undefined;
    const handleOut = (this.visualPoint as any)._handleOut as
      | BezierPointHandle
      | undefined;

    if (handleIn) {
      this.handleInSync = new SyncedBezierPointHandle(
        handleIn,
        this.project,
        this.layerId,
        this.frameId,
        this.pathId,
        this.pointIndex,
        "handle-in",
        this.observerManager
      );
      this.handleInSync.initialize();
    }

    if (handleOut) {
      this.handleOutSync = new SyncedBezierPointHandle(
        handleOut,
        this.project,
        this.layerId,
        this.frameId,
        this.pathId,
        this.pointIndex,
        "handle-out",
        this.observerManager
      );
      this.handleOutSync.initialize();
    }
  }

  // ========================================================================
  // Visual → Data Sync
  // ========================================================================

  private setupVisualHandlers(): void {
    // Store original onChange
    const originalOnChange = (this.visualPoint as any).onChange;

    // Set our sync handler
    (this.visualPoint as any).onChange = () => {
      // Call original if exists
      if (originalOnChange) {
        originalOnChange();
      }

      // Sync to data
      this.syncVisualToData();
    };

    this.addCleanup(() => {
      // Restore original onChange on cleanup
      if (originalOnChange) {
        (this.visualPoint as any).onChange = originalOnChange;
      }
    });
  }

  private syncVisualToData(): void {
    if (!this.shouldSync()) return;

    this.syncGuard.execute(() => {
      const position = this.visualPoint.getPosition();

      // Update the point position in the data model
      const updateData: Partial<BezierPoint> = {
        position,
      };

      this.project.updatePointInPath(
        this.layerId,
        this.frameId,
        this.pathId,
        this.pointIndex,
        updateData
      );

      // Note: Handles are synced by their own SyncedBezierPointHandle instances
    });
  }

  // ========================================================================
  // Data → Visual Sync
  // ========================================================================

  private setupDataObservers(): void {
    const layerFrameMasks = this.project.ydoc.getArray("layerFrameMasks");

    const observerCallback = () => {
      if (!this.shouldSync()) return;

      const dataPoint = this.getDataPoint();
      if (dataPoint) {
        this.syncDataToVisual(dataPoint);
      }
    };

    // Observe deep changes
    layerFrameMasks.observeDeep(observerCallback);

    // Register cleanup
    this.observerManager.register(this.observerId, () => {
      layerFrameMasks.unobserveDeep(observerCallback);
    });

    this.addCleanup(() => {
      this.observerManager.unregister(this.observerId);
    });
  }

  private syncDataToVisual(dataPoint: BezierPoint): void {
    if (!this.shouldSync()) return;

    this.syncGuard.execute(() => {
      const currentPosition = this.visualPoint.getPosition();

      // Check if position changed
      if (
        !this.changeDetector.positionChanged(
          currentPosition,
          dataPoint.position
        )
      ) {
        return; // No meaningful change
      }

      // Update visual point position
      this.visualPoint.updatePosition(dataPoint.position);

      // Note: Handles are synced by their own SyncedBezierPointHandle instances
    });
  }

  // ========================================================================
  // Data Access Helpers
  // ========================================================================

  private getDataPoint(): BezierPoint | undefined {
    const paths = this.project.getLayerFrameMasks(this.layerId, this.frameId);
    const path = paths.find((p) => p.id === this.pathId);

    if (!path || this.pointIndex >= path.points.length) {
      return undefined;
    }

    return path.points[this.pointIndex];
  }
}

// ============================================================================
// Class 2.3: SyncedBezierPath
// ============================================================================

/**
 * Syncs entire bezier path including point array reconciliation.
 * Manages array of SyncedBezierPoint instances.
 */
export class SyncedBezierPath extends BaseSyncManager {
  private visualPath: KonvaBezierPath;
  private project: VideoEditingProject;
  private layerId: string;
  private frameId: string;
  private pathId: string;
  private syncedPoints: SyncedBezierPoint[] = [];
  private observerManager: YjsObserverManager;
  private observerId: string;

  constructor(
    visualPath: KonvaBezierPath,
    project: VideoEditingProject,
    layerId: string,
    frameId: string,
    pathId: string,
    observerManager: YjsObserverManager
  ) {
    super();
    this.visualPath = visualPath;
    this.project = project;
    this.layerId = layerId;
    this.frameId = frameId;
    this.pathId = pathId;
    this.observerManager = observerManager;
    this.observerId = generatePathObserverId(layerId, frameId, pathId);
  }

  initialize(): void {
    if (this.isInitialized) return;

    this.setupVisualHandlers();
    this.setupDataObservers();

    // Initial sync: reconcile with data
    this.reconcile();

    this.setInitialized(true);
  }

  destroy(): void {
    if (!this.isInitialized) return;

    // Destroy all synced points
    for (const syncedPoint of this.syncedPoints) {
      syncedPoint.destroy();
    }
    this.syncedPoints = [];

    this.observerManager.unregister(this.observerId);
    this.cleanup();
    this.setInitialized(false);
  }

  // ========================================================================
  // Visual → Data Sync
  // ========================================================================

  private setupVisualHandlers(): void {
    // We need to handle:
    // 1. Path property changes (closed, visible, name)
    // 2. Point array changes (points added/removed)
    // For now, we'll focus on path properties
    // Point changes are handled by individual SyncedBezierPoint instances
    // Note: BezierPath doesn't have built-in change events for properties
    // We may need to add methods to manually trigger syncs when:
    // - setClosed() is called
    // - Path properties change
    // For this implementation, we'll add a manual sync trigger
  }

  /**
   * Manually sync path properties from visual to data
   * Call this when path properties change (closed, visible, name)
   */
  syncPathProperties(): void {
    if (!this.shouldSync()) return;

    this.syncGuard.execute(() => {
      const dataPath = this.getDataPath();
      if (!dataPath) return;

      const isClosed = this.visualPath.isClosed();

      // Check if anything changed
      if (dataPath.closed !== isClosed) {
        this.project.updatePath(this.layerId, this.frameId, this.pathId, {
          closed: isClosed,
        });
      }
    });
  }

  // ========================================================================
  // Data → Visual Reconciliation
  // ========================================================================

  private setupDataObservers(): void {
    const layerFrameMasks = this.project.ydoc.getArray("layerFrameMasks");

    const observerCallback = () => {
      if (!this.shouldSync()) return;
      this.reconcile();
    };

    // Observe deep changes
    layerFrameMasks.observeDeep(observerCallback);

    // Register cleanup
    this.observerManager.register(this.observerId, () => {
      layerFrameMasks.unobserveDeep(observerCallback);
    });

    this.addCleanup(() => {
      this.observerManager.unregister(this.observerId);
    });
  }

  private reconcile(): void {
    if (!this.shouldSync()) return;

    this.syncGuard.execute(() => {
      const dataPath = this.getDataPath();
      if (!dataPath) return;

      // Reconcile path properties
      this.reconcilePathProperties(dataPath);

      // Reconcile points array
      this.reconcilePoints(dataPath.points);
    });
  }

  private reconcilePathProperties(dataPath: BezierPath): void {
    const currentClosed = this.visualPath.isClosed();

    // Update closed state if changed
    if (currentClosed !== dataPath.closed) {
      this.visualPath.setClosed(dataPath.closed);
    }

    // Could add more properties here (stroke, fill, etc.)
  }

  private reconcilePoints(dataPoints: BezierPoint[]): void {
    const visualPoints = this.visualPath.getPoints();

    // Compute diff
    const diff = this.diffPointArrays(dataPoints, visualPoints);

    // Apply removals (in reverse order to maintain indices)
    for (let i = diff.toRemove.length - 1; i >= 0; i--) {
      const index = diff.toRemove[i];
      this.removeSyncedPoint(index);
      this.visualPath.removePoint(index);
    }

    // Apply additions
    for (const { point, index } of diff.toAdd) {
      this.addVisualPoint(point, index);
    }

    // Apply updates
    for (const { index } of diff.toUpdate) {
      // Points are updated by their individual SyncedBezierPoint instances
      // We just need to ensure they're in sync
      const syncedPoint = this.syncedPoints[index];
      if (syncedPoint) {
        // The point's own observer will handle the update
        // We don't need to do anything here
      }
    }

    // Update indices for all synced points
    this.updatePointIndices();
  }

  private diffPointArrays(
    dataPoints: BezierPoint[],
    visualPoints: KonvaBezierPoint[]
  ): {
    toAdd: { point: BezierPoint; index: number }[];
    toRemove: number[];
    toUpdate: { index: number; point: BezierPoint }[];
  } {
    const toAdd: { point: BezierPoint; index: number }[] = [];
    const toRemove: number[] = [];
    const toUpdate: { index: number; point: BezierPoint }[] = [];

    // Simple diff: compare lengths and check each position
    const dataLength = dataPoints.length;
    const visualLength = visualPoints.length;

    if (dataLength > visualLength) {
      // Points were added
      for (let i = visualLength; i < dataLength; i++) {
        toAdd.push({ point: dataPoints[i], index: i });
      }
    } else if (dataLength < visualLength) {
      // Points were removed
      for (let i = dataLength; i < visualLength; i++) {
        toRemove.push(i);
      }
    }

    // Check for updates in existing points
    const minLength = Math.min(dataLength, visualLength);
    for (let i = 0; i < minLength; i++) {
      const dataPoint = dataPoints[i];
      const visualPoint = visualPoints[i];

      // Convert visual point to comparable format
      const visualPos = visualPoint.getPosition();
      const visualPointData: BezierPoint = {
        position: visualPos,
        handleIn: null, // Will be checked by handle sync
        handleOut: null, // Will be checked by handle sync
      };

      if (this.changeDetector.pointChanged(dataPoint, visualPointData)) {
        toUpdate.push({ index: i, point: dataPoint });
      }
    }

    return { toAdd, toRemove, toUpdate };
  }

  // ========================================================================
  // Point Management
  // ========================================================================

  private addVisualPoint(dataPoint: BezierPoint, index: number): void {
    // Create visual point from data
    const visualPoint = this.visualPath.insertPoint(
      index,
      dataPoint.position,
      dataPoint.handleIn?.angle,
      dataPoint.handleIn?.distance,
      dataPoint.handleOut?.angle,
      dataPoint.handleOut?.distance
    );

    // Create synced point
    this.addSyncedPoint(visualPoint, index);
  }

  private addSyncedPoint(visualPoint: KonvaBezierPoint, index: number): void {
    const syncedPoint = new SyncedBezierPoint(
      visualPoint,
      this.project,
      this.layerId,
      this.frameId,
      this.pathId,
      index,
      this.observerManager
    );

    syncedPoint.initialize();
    this.syncedPoints.splice(index, 0, syncedPoint);
  }

  private removeSyncedPoint(index: number): void {
    if (index >= 0 && index < this.syncedPoints.length) {
      const syncedPoint = this.syncedPoints[index];
      syncedPoint.destroy();
      this.syncedPoints.splice(index, 1);
    }
  }

  private updatePointIndices(): void {
    for (let i = 0; i < this.syncedPoints.length; i++) {
      this.syncedPoints[i].updatePointIndex(i);
    }
  }

  // ========================================================================
  // Data Access Helpers
  // ========================================================================

  private getDataPath(): BezierPath | undefined {
    const paths = this.project.getLayerFrameMasks(this.layerId, this.frameId);
    return paths.find((p) => p.id === this.pathId);
  }

  // ========================================================================
  // Public API
  // ========================================================================

  /**
   * Get the visual path
   */
  getVisualPath(): KonvaBezierPath {
    return this.visualPath;
  }

  /**
   * Get the path ID
   */
  getPathId(): string {
    return this.pathId;
  }

  /**
   * Get all synced points
   */
  getSyncedPoints(): SyncedBezierPoint[] {
    return [...this.syncedPoints];
  }
}
