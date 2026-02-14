/**
 * Phase 1: Core Synchronization Infrastructure
 *
 * This file contains the foundational classes for the bezier path sync system:
 * - SyncGuard: Prevents circular update loops
 * - ChangeDetector: Detects meaningful changes between states
 * - BaseSyncManager: Abstract base class for all sync managers
 * - YjsObserverManager: Centralized Yjs observer management
 */

import type { BezierPoint, BezierPath } from "@/lib/data-model/types";
import type { HandleType } from "../complex-shapes";

// ============================================================================
// Types
// ============================================================================

export interface Position {
  x: number;
  y: number;
}

export interface PolarHandle {
  angle: number;
  distance: number;
}

// ============================================================================
// Class 1.1: SyncGuard
// ============================================================================

/**
 * Prevents circular update loops during bidirectional synchronization.
 *
 * Usage:
 *   const guard = new SyncGuard();
 *
 *   // Manual control
 *   if (guard.enter()) {
 *     // do work
 *     guard.exit();
 *   }
 *
 *   // Automatic control
 *   guard.execute(() => {
 *     // do work - guard automatically managed
 *   });
 */
export class SyncGuard {
  private isGuarded: boolean = false;

  /**
   * Enter guarded section
   * @returns false if already guarded (preventing nested guards)
   */
  enter(): boolean {
    if (this.isGuarded) {
      return false;
    }
    this.isGuarded = true;
    return true;
  }

  /**
   * Exit guarded section
   */
  exit(): void {
    this.isGuarded = false;
  }

  /**
   * Execute function with automatic guard management
   * @param fn Function to execute
   * @returns Function result, or null if already guarded
   */
  execute<T>(fn: () => T): T | null {
    if (!this.enter()) {
      return null;
    }

    try {
      return fn();
    } finally {
      this.exit();
    }
  }

  /**
   * Check if currently in guarded state
   */
  isActive(): boolean {
    return this.isGuarded;
  }

  /**
   * Force reset the guard (use with caution)
   */
  reset(): void {
    this.isGuarded = false;
  }
}

// ============================================================================
// Class 1.2: ChangeDetector
// ============================================================================

/**
 * Detects meaningful changes between data and visual states.
 * Uses thresholds to avoid unnecessary updates from floating point precision.
 */
export class ChangeDetector {
  private readonly DEFAULT_POSITION_THRESHOLD = 0.01; // pixels
  private readonly DEFAULT_ANGLE_THRESHOLD = 0.001; // radians (~0.057 degrees)
  private readonly DEFAULT_DISTANCE_THRESHOLD = 0.01; // pixels

  /**
   * Compare two positions with threshold
   */
  positionChanged(
    pos1: Position | null | undefined,
    pos2: Position | null | undefined,
    threshold: number = this.DEFAULT_POSITION_THRESHOLD
  ): boolean {
    // Handle null/undefined cases
    if (pos1 === null || pos1 === undefined) {
      return pos2 !== null && pos2 !== undefined;
    }
    if (pos2 === null || pos2 === undefined) {
      return true;
    }

    const dx = Math.abs(pos1.x - pos2.x);
    const dy = Math.abs(pos1.y - pos2.y);

    return dx > threshold || dy > threshold;
  }

  /**
   * Compare two polar handles with threshold
   */
  polarHandleChanged(
    handle1: PolarHandle | null | undefined,
    handle2: PolarHandle | null | undefined,
    angleThreshold: number = this.DEFAULT_ANGLE_THRESHOLD,
    distanceThreshold: number = this.DEFAULT_DISTANCE_THRESHOLD
  ): boolean {
    // Handle null/undefined cases
    if (handle1 === null || handle1 === undefined) {
      return handle2 !== null && handle2 !== undefined;
    }
    if (handle2 === null || handle2 === undefined) {
      return true;
    }

    const angleDiff = Math.abs(handle1.angle - handle2.angle);
    const distanceDiff = Math.abs(handle1.distance - handle2.distance);

    return angleDiff > angleThreshold || distanceDiff > distanceThreshold;
  }

  /**
   * Compare two bezier points (position + both handles)
   */
  pointChanged(
    point1: BezierPoint | null | undefined,
    point2: BezierPoint | null | undefined
  ): boolean {
    // Handle null/undefined cases
    if (point1 === null || point1 === undefined) {
      return point2 !== null && point2 !== undefined;
    }
    if (point2 === null || point2 === undefined) {
      return true;
    }

    // Check position
    if (this.positionChanged(point1.position, point2.position)) {
      return true;
    }

    // Check handleIn
    if (this.polarHandleChanged(point1.handleIn, point2.handleIn)) {
      return true;
    }

    // Check handleOut
    if (this.polarHandleChanged(point1.handleOut, point2.handleOut)) {
      return true;
    }

    return false;
  }

  /**
   * Compare two bezier paths (points array + metadata)
   */
  pathChanged(
    path1: BezierPath | null | undefined,
    path2: BezierPath | null | undefined
  ): boolean {
    // Handle null/undefined cases
    if (path1 === null || path1 === undefined) {
      return path2 !== null && path2 !== undefined;
    }
    if (path2 === null || path2 === undefined) {
      return true;
    }

    // Check metadata
    if (path1.closed !== path2.closed) return true;
    if (path1.visible !== path2.visible) return true;
    if (path1.name !== path2.name) return true;

    // Check points array length
    if (path1.points.length !== path2.points.length) {
      return true;
    }

    // Check each point
    for (let i = 0; i < path1.points.length; i++) {
      if (this.pointChanged(path1.points[i], path2.points[i])) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generic deep equality check
   * Note: This is a simple implementation. Consider using a library like fast-deep-equal for production.
   */
  deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;

    if (
      typeof obj1 !== "object" ||
      typeof obj2 !== "object" ||
      obj1 === null ||
      obj2 === null
    ) {
      return false;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
  }
}

// ============================================================================
// Class 1.3: BaseSyncManager (Abstract)
// ============================================================================

/**
 * Abstract base class for all sync managers.
 * Provides common lifecycle, guard logic, and cleanup handling.
 */
export abstract class BaseSyncManager {
  protected syncGuard: SyncGuard;
  protected changeDetector: ChangeDetector;
  protected cleanupHandlers: (() => void)[] = [];
  protected isInitialized: boolean = false;
  protected isPaused: boolean = false;

  constructor() {
    this.syncGuard = new SyncGuard();
    this.changeDetector = new ChangeDetector();
  }

  /**
   * Initialize the sync manager - must be implemented by subclasses
   */
  abstract initialize(): void;

  /**
   * Destroy the sync manager and cleanup resources - must be implemented by subclasses
   */
  abstract destroy(): void;

  /**
   * Pause synchronization (useful during batch operations)
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume synchronization
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Check if currently paused
   */
  paused(): boolean {
    return this.isPaused;
  }

  /**
   * Check if initialized
   */
  initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Register a cleanup handler to be called on destroy
   */
  protected addCleanup(handler: () => void): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Execute all cleanup handlers
   */
  protected cleanup(): void {
    for (const handler of this.cleanupHandlers) {
      try {
        handler();
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    }
    this.cleanupHandlers = [];
  }

  /**
   * Check if sync should proceed (not paused, not guarded)
   */
  protected shouldSync(): boolean {
    return !this.isPaused && !this.syncGuard.isActive();
  }

  /**
   * Mark as initialized
   */
  protected setInitialized(value: boolean): void {
    this.isInitialized = value;
  }
}

// ============================================================================
// Class 1.4: YjsObserverManager
// ============================================================================

/**
 * Centralized management of Yjs observers with automatic cleanup.
 * Prevents memory leaks by tracking all observers and providing batch cleanup.
 */
export class YjsObserverManager {
  private observers: Map<string, () => void> = new Map();

  /**
   * Register an observer with a unique ID
   * @param observerId Unique identifier for this observer
   * @param unsubscribe Function to call to unsubscribe
   */
  register(observerId: string, unsubscribe: () => void): void {
    // Unregister existing observer with same ID
    if (this.observers.has(observerId)) {
      this.unregister(observerId);
    }

    this.observers.set(observerId, unsubscribe);
  }

  /**
   * Unregister a specific observer
   * @param observerId The observer ID to unregister
   * @returns true if observer was found and unregistered
   */
  unregister(observerId: string): boolean {
    const unsubscribe = this.observers.get(observerId);

    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (error) {
        console.error(`Error unregistering observer ${observerId}:`, error);
      }
      this.observers.delete(observerId);
      return true;
    }

    return false;
  }

  /**
   * Unregister all observers
   */
  unregisterAll(): void {
    for (const [observerId, unsubscribe] of this.observers.entries()) {
      try {
        unsubscribe();
      } catch (error) {
        console.error(`Error unregistering observer ${observerId}:`, error);
      }
    }
    this.observers.clear();
  }

  /**
   * Check if an observer is registered
   */
  has(observerId: string): boolean {
    return this.observers.has(observerId);
  }

  /**
   * Get count of active observers
   */
  count(): number {
    return this.observers.size;
  }

  /**
   * Get all observer IDs
   */
  getObserverIds(): string[] {
    return Array.from(this.observers.keys());
  }

  /**
   * Clear all observers (same as unregisterAll, but semantic difference)
   */
  clear(): void {
    this.unregisterAll();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique observer ID for a path
 */
export function generatePathObserverId(
  layerId: string,
  frameId: string,
  pathId: string
): string {
  return `path:${layerId}:${frameId}:${pathId}`;
}

/**
 * Generate a unique observer ID for a point
 */
export function generatePointObserverId(
  layerId: string,
  frameId: string,
  pathId: string,
  pointIndex: number
): string {
  return `point:${layerId}:${frameId}:${pathId}:${pointIndex}`;
}

/**
 * Generate a unique observer ID for a handle
 */
export function generateHandleObserverId(
  layerId: string,
  frameId: string,
  pathId: string,
  pointIndex: number,
  handleType: HandleType
): string {
  return `handle:${layerId}:${frameId}:${pathId}:${pointIndex}:${handleType}`;
}
