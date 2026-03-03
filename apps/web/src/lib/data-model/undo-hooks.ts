import { useState, useEffect, useCallback, useMemo } from "react";
import {
  VideoEditingProject,
  type UndoRedoState,
  type UndoRedoMetadata,
} from "./impl-yjs-v2";

/**
 * Hook to manage undo/redo state reactively
 */
export function useUndoRedoState(project: VideoEditingProject) {
  const [state, setState] = useState<UndoRedoState>(() =>
    project.getUndoRedoState()
  );

  useEffect(() => {
    const unsubscribe = project.onUndoRedoStateChange((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [project]);

  const undo = useCallback(() => {
    return project.undo();
  }, [project]);

  const redo = useCallback(() => {
    return project.redo();
  }, [project]);

  const clearHistory = useCallback(() => {
    project.clearUndoRedoHistory();
  }, [project]);

  return {
    state,
    undo,
    redo,
    clearHistory,
  };
}

/**
 * Hook to get undo history with metadata
 */
export function useUndoHistory(project: VideoEditingProject) {
  const [history, setHistory] = useState<UndoRedoMetadata[]>([]);
  const { state } = useUndoRedoState(project);

  useEffect(() => {
    // Update history whenever the undo/redo state changes
    const newHistory = project.getUndoStackWithMetadata();
    setHistory(newHistory);
  }, [project, state.undoStackSize]);

  const undoToIndex = useCallback(
    (targetIndex: number) => {
      return project.undoToIndex(targetIndex);
    },
    [project]
  );

  return {
    history,
    undoToIndex,
  };
}

/**
 * Hook to get formatted undo descriptions for UI display
 */
export function useUndoDescriptions(project: VideoEditingProject) {
  const { history } = useUndoHistory(project);

  const descriptions = useMemo(() => {
    return history.map((metadata, index) => ({
      index,
      description: metadata.description,
      type: metadata.type,
      targetName: metadata.targetName,
      timestamp: metadata.timestamp,
      relativeTime: getRelativeTime(metadata.timestamp),
      icon: getOperationIcon(metadata.type),
    }));
  }, [history]);

  return descriptions;
}

/**
 * Utility function to get relative time string
 */
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/**
 * Utility function to get operation icon based on type
 */
function getOperationIcon(type: string): string {
  const iconMap: Record<string, string> = {
    project: "⚙️",
    frame: "🎬",
    layer: "📑",
    path: "✏️",
    point: "📍",
    batch: "📦",
  };
  return iconMap[type] || "📝";
}

/**
 * Hook for keyboard shortcuts
 */
export function useUndoKeyboardShortcuts(project: VideoEditingProject) {
  const { undo, redo } = useUndoRedoState(project);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "z" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "z" &&
        event.shiftKey
      ) {
        event.preventDefault();
        redo();
      }

      // Ctrl+Y or Cmd+Y for redo (alternative)
      if ((event.ctrlKey || event.metaKey) && event.key === "y") {
        event.preventDefault();
        redo();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);
}
