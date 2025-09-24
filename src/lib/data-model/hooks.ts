import { useState, useEffect, useCallback } from "react";
import type { Layer } from "@/lib/data-model/types";
import { VideoEditingProject } from "./impl-yjs";
/**
 * Custom hook for reactively reading all layers from a VideoEditingProject instance.
 * Automatically updates when the underlying Yjs document changes.
 */
export function useAllLayers(project: VideoEditingProject | null) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to safely fetch layers from the project
  const fetchLayers = useCallback(() => {
    if (!project) {
      setLayers([]);
      setIsLoading(false);
      return;
    }

    try {
      const allLayers = project.getAllLayers();
      setLayers(allLayers);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch layers")
      );
      setLayers([]);
    } finally {
      setIsLoading(false);
    }
  }, [project]);

  // Set up Yjs document observation for reactive updates
  useEffect(() => {
    if (!project) {
      setLayers([]);
      setIsLoading(false);
      return;
    }

    // Initial fetch
    fetchLayers();

    // Subscribe to changes in the layers array
    const layersArray = project.ydoc.getArray("layers");

    const handleLayersChange = () => {
      fetchLayers();
    };

    // Listen for changes to the layers array
    layersArray.observe(handleLayersChange);

    // Also listen for changes to individual layer properties
    const handleDeepChange = () => {
      fetchLayers();
    };

    layersArray.observeDeep(handleDeepChange);

    // Cleanup function
    return () => {
      layersArray.unobserve(handleLayersChange);
      layersArray.unobserveDeep(handleDeepChange);
    };
  }, [project, fetchLayers]);

  // Helper function to get a specific layer by ID
  const getLayerById = useCallback(
    (layerId: string): Layer | undefined => {
      return layers.find((layer) => layer.id === layerId);
    },
    [layers]
  );

  // Helper function to get visible layers
  const getVisibleLayers = useCallback((): Layer[] => {
    return layers.filter((layer) => layer.visible);
  }, [layers]);

  // Helper function to get locked layers
  const getLockedLayers = useCallback((): Layer[] => {
    return layers.filter((layer) => layer.locked);
  }, [layers]);

  // Helper function to get layers sorted by a specific property
  const getLayersSorted = useCallback(
    (sortBy: keyof Layer = "name", ascending: boolean = true): Layer[] => {
      return [...layers].sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];

        if (aValue < bValue) return ascending ? -1 : 1;
        if (aValue > bValue) return ascending ? 1 : -1;
        return 0;
      });
    },
    [layers]
  );

  return {
    // Core data
    layers,
    isLoading,
    error,

    // Helper functions
    getLayerById,
    getVisibleLayers,
    getLockedLayers,
    getLayersSorted,

    // Manual refresh function (useful for force updates)
    refresh: fetchLayers,

    // Computed values
    layerCount: layers.length,
    visibleCount: layers.filter((l) => l.visible).length,
    lockedCount: layers.filter((l) => l.locked).length,
  };
}

/**
 * Extended hook that provides additional layer management utilities
 */
export function useLayerManager(project: VideoEditingProject | null) {
  const layerState = useAllLayers(project);

  // Layer manipulation functions that trigger reactive updates
  const addLayer = useCallback(
    async (layerData: Partial<Layer>): Promise<Layer | null> => {
      if (!project) return null;

      try {
        const newLayer = project.addLayer(layerData);
        // The hook will automatically update due to Yjs observation
        return newLayer;
      } catch (error) {
        console.error("Failed to add layer:", error);
        return null;
      }
    },
    [project]
  );

  const removeLayer = useCallback(
    async (layerId: string): Promise<boolean> => {
      if (!project) return false;

      try {
        const success = project.removeLayer(layerId);
        // The hook will automatically update due to Yjs observation
        return success;
      } catch (error) {
        console.error("Failed to remove layer:", error);
        return false;
      }
    },
    [project]
  );

  const updateLayer = useCallback(
    async (layerId: string, updates: Partial<Layer>): Promise<boolean> => {
      if (!project) return false;

      try {
        // Since the current interface doesn't have updateLayer, we need to work around it
        // This would be better if we added updateLayer to the ILayerManager interface
        const layer = project.getLayer(layerId);
        if (!layer) return false;
        
        project.updateLayer(layerId, updates);
        return true;
      } catch (error) {
        console.error("Failed to update layer:", error);
        return false;
      }
    },
    [project]
  );

  return {
    ...layerState,

    // Management functions
    addLayer,
    removeLayer,
    updateLayer,
  };
}

/**
 * Lightweight hook for just getting layer count (useful for performance)
 */
export function useLayerCount(project: VideoEditingProject | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!project) {
      setCount(0);
      return;
    }

    const updateCount = () => {
      try {
        const layers = project.getAllLayers();
        setCount(layers.length);
      } catch {
        setCount(0);
      }
    };

    // Initial count
    updateCount();

    // Subscribe to changes
    const layersArray = project.ydoc.getArray("layers");
    layersArray.observe(updateCount);

    return () => {
      layersArray.unobserve(updateCount);
    };
  }, [project]);

  return count;
}
