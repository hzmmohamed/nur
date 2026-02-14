/**
 * Phase 6: React Hooks for BezierSyncEngine
 *
 * React hooks for managing Bezier path synchronization in React components.
 */

import { useState, useEffect, useCallback } from "react";
import {
  BezierSyncEngine,
  type BezierSyncEngineConfig,
  type PathDrawingOptions,
} from "./engine";
import { SyncedBezierPath } from "./synced-shapes";
import { LayerFrameContext } from "./layer-frame-context";
import type { BezierPoint } from "../data-model/types";

// ============================================================================
// Hook 1: useBezierSyncEngine
// ============================================================================

/**
 * Create and manage a BezierSyncEngine instance.
 * Automatically handles cleanup on unmount.
 *
 * @example
 * ```typescript
 * const engine = useBezierSyncEngine({
 *   layer,
 *   project,
 *   initialLayerId: 'layer1',
 *   initialFrameId: 'frame1'
 * });
 *
 * if (!engine) return <div>Loading...</div>;
 *
 * // Use engine...
 * ```
 */
export function useBezierSyncEngine(
  config: BezierSyncEngineConfig | null
): BezierSyncEngine | null {
  const [engine, setEngine] = useState<BezierSyncEngine | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!config) {
      setEngine(null);
      return;
    }

    try {
      const newEngine = new BezierSyncEngine(config);
      setEngine(newEngine);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setEngine(null);
    }

    // Cleanup
    return () => {
      if (engine) {
        engine.destroy();
      }
    };
  }, [config?.layer, config?.project]); // Only recreate if layer or project changes

  // Throw error in development to help debugging
  if (error) {
    console.error("Failed to create BezierSyncEngine:", error);
  }

  return engine;
}

// ============================================================================
// Hook 2: useActiveLayerFrame
// ============================================================================

/**
 * Manage the active layer-frame context.
 * Returns the current context and a setter function.
 *
 * @example
 * ```typescript
 * const { layerId, frameId, context, setActiveLayerFrame } = useActiveLayerFrame(engine);
 *
 * // Switch context
 * setActiveLayerFrame('layer2', 'frame3');
 * ```
 */
export function useActiveLayerFrame(engine: BezierSyncEngine | null) {
  const [layerId, setLayerId] = useState<string | null>(null);
  const [frameId, setFrameId] = useState<string | null>(null);
  const [context, setContext] = useState<LayerFrameContext | null>(null);

  const setActiveLayerFrame = useCallback(
    (newLayerId: string, newFrameId: string) => {
      if (!engine) return;

      const newContext = engine.setActiveLayerFrame(newLayerId, newFrameId);
      setLayerId(newLayerId);
      setFrameId(newFrameId);
      setContext(newContext);
    },
    [engine]
  );

  // Initialize with current context
  useEffect(() => {
    if (!engine) {
      setLayerId(null);
      setFrameId(null);
      setContext(null);
      return;
    }

    const currentContext = engine.getCurrentContext();
    if (currentContext) {
      setLayerId(currentContext.getLayerId());
      setFrameId(currentContext.getFrameId());
      setContext(currentContext);
    }
  }, [engine]);

  return {
    layerId,
    frameId,
    context,
    setActiveLayerFrame,
  };
}

// ============================================================================
// Hook 3: useSyncedPaths
// ============================================================================

/**
 * Get all synced paths from the current active context.
 * Automatically updates when paths are added/removed.
 *
 * @example
 * ```typescript
 * const { paths, isLoading } = useSyncedPaths(engine);
 *
 * return (
 *   <div>
 *     {paths.map(path => (
 *       <PathItem key={path.getPathId()} path={path} />
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useSyncedPaths(engine: BezierSyncEngine | null) {
  const [paths, setPaths] = useState<SyncedBezierPath[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!engine) {
      setPaths([]);
      setIsLoading(false);
      return;
    }

    const updatePaths = () => {
      const allPaths = engine.getAllSyncedPaths();
      setPaths(allPaths);
      setIsLoading(false);
    };

    // Initial load
    updatePaths();

    // Subscribe to changes in the data model
    const context = engine.getCurrentContext();
    if (!context) {
      setIsLoading(false);
      return;
    }

    const project = engine.getProject();
    const layerFrameMasks = project.ydoc.getArray("layerFrameMasks");

    const observer = () => {
      updatePaths();
    };

    layerFrameMasks.observeDeep(observer);

    // Cleanup
    return () => {
      layerFrameMasks.unobserveDeep(observer);
    };
  }, [engine]);

  return {
    paths,
    isLoading,
    pathCount: paths.length,
  };
}

// ============================================================================
// Hook 4: usePathDrawing
// ============================================================================

/**
 * Manage path drawing state and operations.
 * Provides methods to start, finish, and cancel drawing.
 *
 * @example
 * ```typescript
 * const {
 *   isDrawing,
 *   activePath,
 *   startDrawing,
 *   finishDrawing,
 *   cancelDrawing,
 *   addPoint
 * } = usePathDrawing(engine);
 *
 * // Start drawing
 * const handleStartDrawing = () => {
 *   startDrawing({ stroke: '#FF0000' });
 * };
 *
 * // Add point on canvas click
 * const handleCanvasClick = (e) => {
 *   if (isDrawing) {
 *     addPoint({
 *       position: { x: e.clientX, y: e.clientY },
 *       handleIn: null,
 *       handleOut: { angle: 0, distance: 50 }
 *     });
 *   }
 * };
 * ```
 */
export function usePathDrawing(engine: BezierSyncEngine | null) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [activePath, setActivePath] = useState<SyncedBezierPath | null>(null);

  const startDrawing = useCallback(
    (options?: PathDrawingOptions) => {
      if (!engine) {
        console.warn("Cannot start drawing: engine is null");
        return null;
      }

      try {
        const path = engine.startDrawingPath(options);
        setIsDrawing(true);
        setActivePath(path);
        return path;
      } catch (error) {
        console.error("Failed to start drawing:", error);
        return null;
      }
    },
    [engine]
  );

  const finishDrawing = useCallback(() => {
    if (!engine) return;

    try {
      engine.finishDrawingPath();
      setIsDrawing(false);
      setActivePath(null);
    } catch (error) {
      console.error("Failed to finish drawing:", error);
    }
  }, [engine]);

  const cancelDrawing = useCallback(() => {
    if (!engine) return;

    try {
      engine.cancelDrawingPath();
      setIsDrawing(false);
      setActivePath(null);
    } catch (error) {
      console.error("Failed to cancel drawing:", error);
    }
  }, [engine]);

  const addPoint = useCallback(
    (point: BezierPoint) => {
      if (!engine || !activePath) {
        console.warn("Cannot add point: not currently drawing");
        return false;
      }

      try {
        return engine.addPointToPath(activePath.getPathId(), point);
      } catch (error) {
        console.error("Failed to add point:", error);
        return false;
      }
    },
    [engine, activePath]
  );

  // Sync active path with engine
  useEffect(() => {
    if (!engine) {
      setIsDrawing(false);
      setActivePath(null);
      return;
    }

    const engineActivePath = engine.getActivePath();
    setActivePath(engineActivePath || null);
    setIsDrawing(!!engineActivePath);
  }, [engine]);

  return {
    isDrawing,
    activePath,
    startDrawing,
    finishDrawing,
    cancelDrawing,
    addPoint,
  };
}

// ============================================================================
// Hook 5: usePathOperations
// ============================================================================

/**
 * Provides common path operation methods.
 *
 * @example
 * ```typescript
 * const { deletePath, closePath, updatePoint } = usePathOperations(engine);
 *
 * // Delete a path
 * deletePath('path-id-123');
 *
 * // Close a path
 * closePath('path-id-123');
 * ```
 */
export function usePathOperations(engine: BezierSyncEngine | null) {
  const deletePath = useCallback(
    (pathId: string) => {
      if (!engine) return false;

      try {
        return engine.deletePath(pathId);
      } catch (error) {
        console.error("Failed to delete path:", error);
        return false;
      }
    },
    [engine]
  );

  const closePath = useCallback(
    (pathId: string) => {
      if (!engine) return false;

      try {
        return engine.closePath(pathId);
      } catch (error) {
        console.error("Failed to close path:", error);
        return false;
      }
    },
    [engine]
  );

  const addPointToPath = useCallback(
    (pathId: string, point: BezierPoint) => {
      if (!engine) return false;

      try {
        return engine.addPointToPath(pathId, point);
      } catch (error) {
        console.error("Failed to add point:", error);
        return false;
      }
    },
    [engine]
  );

  const updatePoint = useCallback(
    (pathId: string, pointIndex: number, updates: Partial<BezierPoint>) => {
      if (!engine) return false;

      try {
        return engine.updatePointInPath(pathId, pointIndex, updates);
      } catch (error) {
        console.error("Failed to update point:", error);
        return false;
      }
    },
    [engine]
  );

  const removePoint = useCallback(
    (pathId: string, pointIndex: number) => {
      if (!engine) return false;

      try {
        return engine.removePointFromPath(pathId, pointIndex);
      } catch (error) {
        console.error("Failed to remove point:", error);
        return false;
      }
    },
    [engine]
  );

  return {
    deletePath,
    closePath,
    addPointToPath,
    updatePoint,
    removePoint,
  };
}

// ============================================================================
// Hook 6: useSyncEngineStats
// ============================================================================

/**
 * Get statistics about the sync engine.
 * Useful for debugging and monitoring.
 *
 * @example
 * ```typescript
 * const stats = useSyncEngineStats(engine);
 *
 * return (
 *   <div>
 *     <p>Contexts: {stats.contextCount}</p>
 *     <p>Total Paths: {stats.totalPathCount}</p>
 *     <p>Active: {stats.activeContext?.layerId}</p>
 *   </div>
 * );
 * ```
 */
export function useSyncEngineStats(engine: BezierSyncEngine | null) {
  const [stats, setStats] = useState<{
    contextCount: number;
    totalPathCount: number;
    activeContext: {
      layerId: string;
      frameId: string;
      pathCount: number;
    } | null;
  }>({
    contextCount: 0,
    totalPathCount: 0,
    activeContext: null,
  });

  useEffect(() => {
    if (!engine) {
      setStats({
        contextCount: 0,
        totalPathCount: 0,
        activeContext: null,
      });
      return;
    }

    const updateStats = () => {
      setStats(engine.getStats());
    };

    // Update initially
    updateStats();

    // Update on data changes
    const project = engine.getProject();
    const layerFrameMasks = project.ydoc.getArray("layerFrameMasks");

    layerFrameMasks.observeDeep(updateStats);

    return () => {
      layerFrameMasks.unobserveDeep(updateStats);
    };
  }, [engine]);

  return stats;
}

// ============================================================================
// Hook 7: useSyncState
// ============================================================================

/**
 * Manage sync pause/resume state.
 *
 * @example
 * ```typescript
 * const { isPaused, pauseSync, resumeSync, toggleSync } = useSyncState(engine);
 *
 * // Pause for batch operations
 * const handleBatchUpdate = () => {
 *   pauseSync();
 *   // ... many operations ...
 *   resumeSync();
 * };
 * ```
 */
export function useSyncState(engine: BezierSyncEngine | null) {
  const [isPaused, setIsPaused] = useState(false);

  const pauseSync = useCallback(() => {
    if (!engine) return;
    engine.pauseSync();
    setIsPaused(true);
  }, [engine]);

  const resumeSync = useCallback(() => {
    if (!engine) return;
    engine.resumeSync();
    setIsPaused(false);
  }, [engine]);

  const toggleSync = useCallback(() => {
    if (isPaused) {
      resumeSync();
    } else {
      pauseSync();
    }
  }, [isPaused, pauseSync, resumeSync]);

  // Sync state with engine
  useEffect(() => {
    if (!engine) {
      setIsPaused(false);
      return;
    }

    setIsPaused(engine.isPaused());
  }, [engine]);

  return {
    isPaused,
    pauseSync,
    resumeSync,
    toggleSync,
  };
}

// ============================================================================
// Hook 8: useLayerFrameSync (Composite Hook)
// ============================================================================

/**
 * Composite hook that combines common sync operations.
 * Provides a complete API for layer-frame synchronization.
 *
 * @example
 * ```typescript
 * const sync = useLayerFrameSync({
 *   layer,
 *   project,
 *   initialLayerId: 'layer1',
 *   initialFrameId: 'frame1'
 * });
 *
 * if (!sync.engine) return <div>Loading...</div>;
 *
 * return (
 *   <div>
 *     <button onClick={() => sync.drawing.startDrawing()}>
 *       Start Drawing
 *     </button>
 *     <button onClick={() => sync.drawing.finishDrawing()}>
 *       Finish
 *     </button>
 *     <PathList paths={sync.paths.paths} onDelete={sync.operations.deletePath} />
 *   </div>
 * );
 * ```
 */
export function useLayerFrameSync(config: BezierSyncEngineConfig | null) {
  const engine = useBezierSyncEngine(config);
  const activeContext = useActiveLayerFrame(engine);
  const paths = useSyncedPaths(engine);
  const drawing = usePathDrawing(engine);
  const operations = usePathOperations(engine);
  const stats = useSyncEngineStats(engine);
  const syncState = useSyncState(engine);

  return {
    engine,
    activeContext,
    paths,
    drawing,
    operations,
    stats,
    syncState,
  };
}
