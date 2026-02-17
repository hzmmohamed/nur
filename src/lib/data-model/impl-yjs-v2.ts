import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { TypedYMap, TypedYArrayOfMaps } from "../yjs-utils/typed-wrappers";
import {
  type BezierPoint,
  type BezierPath,
  type LayerFrameMask,
  type Frame,
  type Layer,
  type UserSelection,
  type Project,
  FrameSchema,
  LayerFrameMaskSchema,
  LayerSchema,
  ProjectSchema,
} from "./types";
import { IndexeddbPersistence } from "y-indexeddb";
import type { IVideoEditingProject } from "./interface";

// Types for undo/redo metadata
export interface UndoRedoMetadata {
  type: string;
  description: string;
  timestamp: number;
  targetId?: string;
  targetName?: string;
  data?: any;
}

export interface UndoRedoState {
  canUndo: boolean;
  canRedo: boolean;
  undoStackSize: number;
  redoStackSize: number;
  lastOperation?: UndoRedoMetadata;
}

export class VideoEditingProject implements IVideoEditingProject {
  // Core data structures (private)
  private readonly project: TypedYMap<Project>;
  private readonly frames: TypedYArrayOfMaps<Frame>;
  private readonly layers: TypedYArrayOfMaps<Layer>;
  private readonly layerFrameMasks: TypedYArrayOfMaps<LayerFrameMask>;

  // Awareness for user selections (ephemeral state)
  private readonly awareness: awarenessProtocol.Awareness;

  // Undo/Redo management
  private readonly undoManager: Y.UndoManager;
  private undoRedoCallbacks: Set<(state: UndoRedoState) => void> = new Set();

  // Persistence
  private readonly persistence?: IndexeddbPersistence;

  constructor(
    readonly ydoc: Y.Doc,
    projectData?: Partial<Project>,
    options?: { persistenceKey?: string }
  ) {
    // Initialize typed Yjs structures
    this.project = new TypedYMap(ydoc.getMap("project"), ProjectSchema);
    this.frames = new TypedYArrayOfMaps(ydoc.getArray("frames"), FrameSchema);
    this.layers = new TypedYArrayOfMaps(ydoc.getArray("layers"), LayerSchema);
    this.layerFrameMasks = new TypedYArrayOfMaps(
      ydoc.getArray("layerFrameMasks"),
      LayerFrameMaskSchema
    );

    // Initialize awareness for user selections
    this.awareness = new awarenessProtocol.Awareness(ydoc);

    // Initialize persistence if key provided
    if (options?.persistenceKey) {
      this.persistence = new IndexeddbPersistence(options.persistenceKey, ydoc);
    }

    // Initialize project if data provided
    if (projectData) {
      this.initializeProject(projectData);
    }

    // Initialize undo manager with all the data structures we want to track
    this.undoManager = new Y.UndoManager(this.ydoc, {
      // Capture timeout - operations within this timeframe are grouped
      captureTimeout: 500,
      // Don't track selection changes or other ephemeral state
      // trackedOrigins: new Set(),
    });

    // Set up undo manager event listeners
    this.setupUndoManagerListeners();
  }

  /**
   * Get the persistence instance for advanced usage
   * @returns The IndexeddbPersistence instance if enabled
   */
  getPersistence(): IndexeddbPersistence | undefined {
    return this.persistence;
  }

  /**
   * Wait for persistence to be ready (document loaded from IndexedDB)
   * @returns Promise that resolves when persistence is synced
   */
  async waitForPersistence(): Promise<void> {
    if (!this.persistence) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      if (this.persistence!.synced) {
        resolve();
      } else {
        this.persistence!.once("synced", resolve);
      }
    });
  }

  /**
   * Clear all persisted data from IndexedDB
   * @returns Promise that resolves when data is cleared
   */
  async clearPersistedData(): Promise<void> {
    if (!this.persistence) {
      throw new Error("Persistence not enabled");
    }

    return this.persistence.clearData();
  }

  /**
   * Destroy the persistence connection
   */
  destroyPersistence(): void {
    if (this.persistence) {
      this.persistence.destroy();
    }
  }

  // Project Management
  private initializeProject(projectData: Partial<Project>): void {
    const defaultProject: Project = {
      id: projectData.id || crypto.randomUUID(),
      name: projectData.name || "Untitled Project",
      createdAt: Date.now(),
      lastModified: Date.now(),
      ...projectData,
    };

    this.project.update(defaultProject);
  }

  private setupUndoManagerListeners(): void {
    // Listen for stack changes to notify subscribers
    this.undoManager.on("stack-item-added", () => {
      this.notifyUndoRedoStateChange();
    });

    this.undoManager.on("stack-item-popped", () => {
      this.notifyUndoRedoStateChange();
    });
  }

  private notifyUndoRedoStateChange(): void {
    const state = this.getUndoRedoState();
    this.undoRedoCallbacks.forEach((callback) => callback(state));
  }

  // Add these methods to the VideoEditingProject class to complete the undo/redo functionality

  // Complete the missing getUndoRedoState method
  getUndoRedoState(): UndoRedoState {
    return {
      canUndo: this.undoManager.undoStack.length > 0,
      canRedo: this.undoManager.redoStack.length > 0,
      undoStackSize: this.undoManager.undoStack.length,
      redoStackSize: this.undoManager.redoStack.length,
    };
  }

  /**
   * Perform an undo operation
   * @returns True if undo was performed, false if nothing to undo
   */
  undo(): void {
    this.undoManager.undo();
  }

  /**
   * Perform a redo operation
   * @returns True if redo was performed, false if nothing to redo
   */
  redo(): void {
    this.undoManager.redo();
  }

  /**
   * Subscribe to undo/redo state changes
   * @param callback Function called when undo/redo state changes
   * @returns Unsubscribe function
   */
  onUndoRedoStateChange(callback: (state: UndoRedoState) => void): () => void {
    this.undoRedoCallbacks.add(callback);

    // Call immediately with current state
    callback(this.getUndoRedoState());

    return () => {
      this.undoRedoCallbacks.delete(callback);
    };
  }

  /**
   * Clear all undo/redo history
   */
  clearUndoRedoHistory(): void {
    this.undoManager.clear();
    this.notifyUndoRedoStateChange();
  }

  /**
   * Get undo stack with metadata for each operation
   * @returns Array of undo operations with metadata
   */
  getUndoStackWithMetadata(): UndoRedoMetadata[] {
    const metadataMap = this.undoManager.doc.getMap("_undoMetadata");
    const undoStack: UndoRedoMetadata[] = [];

    // Get the last N operations based on undo stack size
    const stackSize = this.undoManager.undoStack.length;
    const metadataKeys = Array.from(metadataMap.keys())
      .sort()
      .slice(-stackSize);

    metadataKeys.forEach((key) => {
      const metadata = metadataMap.get(key) as UndoRedoMetadata;
      if (metadata) {
        undoStack.push(metadata);
      }
    });

    return undoStack.reverse(); // Most recent first
  }

  /**
   * Undo to a specific operation in the history
   * @param targetIndex Index in the undo stack to revert to (0 = most recent)
   * @returns Number of operations undone
   */
  undoToIndex(targetIndex: number): number {
    const stackSize = this.undoManager.undoStack.length;
    if (targetIndex >= stackSize || targetIndex < 0) {
      return 0;
    }

    let undoCount = 0;
    // Undo operations until we reach the target index
    for (let i = 0; i <= targetIndex; i++) {
      if (this.undoManager.undo()) {
        undoCount++;
      } else {
        break;
      }
    }

    return undoCount;
  }
  private executeWithMetadata<T>(
    operation: () => T,
    metadata: Omit<UndoRedoMetadata, "timestamp">
  ): T {
    const fullMetadata: UndoRedoMetadata = {
      ...metadata,
      timestamp: Date.now(),
    };

    // Store metadata in the undo manager's context
    this.undoManager.doc.transact(() => {
      // Add metadata as a temporary field that can be accessed during undo/redo
      const metadataMap = this.undoManager.doc.getMap("_undoMetadata");
      metadataMap.set(Date.now().toString(), fullMetadata);
    });

    return operation();
  }

  updateProject(updates: Partial<Project>): void {
    this.executeWithMetadata(
      () => {
        this.project.update({
          ...updates,
          lastModified: Date.now(),
        });
      },
      {
        type: "project",
        description: `Update project${
          updates.name ? ` "${updates.name}"` : ""
        }`,
      }
    );
  }

  // Frame Management
  addFrame(frameData: Partial<Frame>): Frame {
    return this.executeWithMetadata(
      () => {
        const frame: Frame = {
          id: crypto.randomUUID(),
          index: frameData.index ?? this.getNextFrameIndex(),
          ...frameData,
        };

        const yFrame = this.frames.addItem(frame);
        return yFrame.toObjectSafe() as Frame;
      },
      {
        type: "frame",
        description: `Add frame at index ${
          frameData.index ?? this.getNextFrameIndex()
        }`,
        data: { action: "add", index: frameData.index },
      }
    );
  }

  getFrame(frameId: string): Frame | undefined {
    const yFrame = this.frames.find((frame) => frame.get("id") === frameId);
    return yFrame ? (yFrame.toObjectSafe() as Frame) : undefined;
  }

  removeFrame(frameId: string): boolean {
    const frame = this.getFrame(frameId);
    if (!frame) return false;

    return this.executeWithMetadata(
      () => {
        // Also remove all associated layer-frame masks
        this.removeAllMasksForFrame(frameId);

        // Clear frame from all user selections in awareness
        this.clearFrameFromAllSelections(frameId);

        return this.frames.removeWhere((frame) => frame.get("id") === frameId);
      },
      {
        type: "frame",
        description: `Remove frame at index ${frame.index}`,
        targetId: frameId,
        data: { action: "remove", index: frame.index },
      }
    );
  }

  getAllFrames(): Frame[] {
    return this.frames.toObjectArraySafe() as Frame[];
  }

  getFramesSortedByIndex(): Frame[] {
    const frames = this.getAllFrames();
    return frames.sort((a, b) => {
      const indexA = a.index ?? 0;
      const indexB = b.index ?? 0;
      return indexA - indexB;
    });
  }

  getNextFrameIndex(): number {
    const frames = this.getAllFrames();
    if (frames.length === 0) return 0;

    const maxIndex = Math.max(...frames.map((frame) => frame.index ?? 0));
    return maxIndex + 1;
  }

  insertFrameAtIndex(index: number, frameData: Partial<Frame>): Frame {
    return this.executeWithMetadata(
      () => {
        // Shift existing frames at or after this index
        const framesToShift = this.frames
          .toArray()
          .filter((frame) => (frame.get("index") ?? 0) >= index);

        framesToShift.forEach((frame) => {
          const currentIndex = frame.get("index") ?? 0;
          frame.set("index", currentIndex + 1);
        });

        // Create new frame at the specified index
        const frame: Frame = {
          id: crypto.randomUUID(),
          index,
          ...frameData,
        };

        const yFrame = this.frames.addItem(frame);
        return yFrame.toObjectSafe() as Frame;
      },
      {
        type: "frame",
        description: `Insert frame at index ${index}`,
        data: {
          action: "insert",
          index,
          shiftedFrames: this.frames
            .toArray()
            .filter((frame) => (frame.get("index") ?? 0) >= index).length,
        },
      }
    );
  }

  reorderFrame(frameId: string, newIndex: number): boolean {
    const frame = this.getFrame(frameId);
    if (!frame) return false;

    return this.executeWithMetadata(
      () => {
        const yFrame = this.frames.find((frame) => frame.get("id") === frameId);
        if (!yFrame) return false;

        const oldIndex = yFrame.get("index") ?? 0;
        if (oldIndex === newIndex) return true;

        // Update indices of affected frames
        if (newIndex > oldIndex) {
          // Moving forward: shift frames between old and new index backward
          this.frames.toArray().forEach((f) => {
            const idx = f.get("index") ?? 0;
            if (idx > oldIndex && idx <= newIndex) {
              f.set("index", idx - 1);
            }
          });
        } else {
          // Moving backward: shift frames between new and old index forward
          this.frames.toArray().forEach((f) => {
            const idx = f.get("index") ?? 0;
            if (idx >= newIndex && idx < oldIndex) {
              f.set("index", idx + 1);
            }
          });
        }

        // Set new index for the moved frame
        yFrame.set("index", newIndex);
        return true;
      },
      {
        type: "frame",
        description: `Reorder frame from index ${frame.index} to ${newIndex}`,
        targetId: frameId,
        data: { action: "reorder", oldIndex: frame.index, newIndex },
      }
    );
  }

  // Layer Management
  addLayer(layerData: Partial<Layer>): Layer {
    return this.executeWithMetadata(
      () => {
        const layer: Layer = {
          id: crypto.randomUUID(),
          name: layerData.name || `Layer ${this.layers.length() + 1}`,
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: "normal",
          ...layerData,
        };

        console.log(layer);

        const yLayer = this.layers.addItem(layer);
        return yLayer.toObjectSafe() as Layer;
      },
      {
        type: "layer",
        description: `Add layer "${
          layerData.name || `Layer ${this.layers.length() + 1}`
        }"`,
        targetName: layerData.name || `Layer ${this.layers.length() + 1}`,
        data: { action: "add" },
      }
    );
  }

  updateLayer(layerId: string, updates: Partial<Layer>): boolean {
    const layer = this.getLayer(layerId);
    if (!layer) return false;

    return this.executeWithMetadata(
      () => {
        const yLayer = this.layers.find((layer) => layer.get("id") === layerId);
        if (!yLayer) return false;

        // Update each property individually to trigger Yjs change events properly
        Object.keys(updates).forEach((key) => {
          const value = updates[key as keyof Layer];
          if (value !== undefined) {
            yLayer.set(key as keyof Layer, value);
          }
        });

        return true;
      },
      {
        type: "layer",
        description: `Update layer "${layer.name}"${
          updates.name ? ` to "${updates.name}"` : ""
        }`,
        targetId: layerId,
        targetName: layer.name,
        data: { action: "update", changes: Object.keys(updates) },
      }
    );
  }

  getLayer(layerId: string): Layer | undefined {
    const yLayer = this.layers.find((layer) => layer.get("id") === layerId);
    return yLayer ? (yLayer.toObjectSafe() as Layer) : undefined;
  }

  removeLayer(layerId: string): boolean {
    const layer = this.getLayer(layerId);
    if (!layer) return false;

    return this.executeWithMetadata(
      () => {
        // Remove all associated layer-frame masks
        this.removeAllMasksForLayer(layerId);

        // Clear layer from all user selections in awareness
        this.clearLayerFromAllSelections(layerId);

        return this.layers.removeWhere((layer) => layer.get("id") === layerId);
      },
      {
        type: "layer",
        description: `Remove layer "${layer.name}"`,
        targetId: layerId,
        targetName: layer.name,
        data: { action: "remove" },
      }
    );
  }

  getAllLayers(): Layer[] {
    return this.layers.toObjectArraySafe() as Layer[];
  }

  // Bezier Path and Mask Management
  addPathToLayerFrame(
    layerId: string,
    frameId: string,
    pathData: Partial<BezierPath>
  ): boolean {
    const layer = this.getLayer(layerId);

    return this.executeWithMetadata(
      () => {
        const path: BezierPath = {
          id: crypto.randomUUID(),
          points: [],
          closed: false,
          visible: true,
          ...pathData,
        };

        // Find existing mask or create new one
        let mask = this.layerFrameMasks.find(
          (mask) =>
            mask.get("layerId") === layerId && mask.get("frameId") === frameId
        );

        if (!mask) {
          mask = this.layerFrameMasks.addItem({
            layerId,
            frameId,
            paths: [path],
          });
        } else {
          const currentPaths = mask.get("paths") || [];
          mask.set("paths", [...currentPaths, path]);
        }

        return true;
      },
      {
        type: "path",
        description: `Add path to layer "${layer?.name || layerId}"`,
        targetId: layerId,
        targetName: layer?.name,
        data: { action: "add", frameId, pathId: pathData.id || "generated" },
      }
    );
  }

  updatePath(
    layerId: string,
    frameId: string,
    pathId: string,
    updates: Partial<BezierPath>
  ): boolean {
    const layer = this.getLayer(layerId);

    return this.executeWithMetadata(
      () => {
        const mask = this.layerFrameMasks.find(
          (mask) =>
            mask.get("layerId") === layerId && mask.get("frameId") === frameId
        );

        if (!mask) return false;

        const paths = mask.get("paths") || [];
        const pathIndex = paths.findIndex((path) => path.id === pathId);

        if (pathIndex === -1) return false;

        const updatedPaths = [...paths];
        updatedPaths[pathIndex] = { ...paths[pathIndex], ...updates };
        mask.set("paths", updatedPaths);

        return true;
      },
      {
        type: "path",
        description: `Update path in layer "${layer?.name || layerId}"`,
        targetId: pathId,
        targetName: layer?.name,
        data: {
          action: "update",
          layerId,
          frameId,
          changes: Object.keys(updates),
        },
      }
    );
  }

  removePath(layerId: string, frameId: string, pathId: string): boolean {
    const layer = this.getLayer(layerId);

    return this.executeWithMetadata(
      () => {
        const mask = this.layerFrameMasks.find(
          (mask) =>
            mask.get("layerId") === layerId && mask.get("frameId") === frameId
        );

        if (!mask) return false;

        const paths = mask.get("paths") || [];
        const filteredPaths = paths.filter((path) => path.id !== pathId);

        if (filteredPaths.length === paths.length) return false;

        // Clear the removed path from all user selections
        this.clearPathFromAllSelections(pathId);

        mask.set("paths", filteredPaths);
        return true;
      },
      {
        type: "path",
        description: `Remove path from layer "${layer?.name || layerId}"`,
        targetId: pathId,
        targetName: layer?.name,
        data: { action: "remove", layerId, frameId },
      }
    );
  }

  getLayerFrameMasks(layerId: string, frameId: string): BezierPath[] {
    const mask = this.layerFrameMasks.find(
      (mask) =>
        mask.get("layerId") === layerId && mask.get("frameId") === frameId
    );

    return mask?.get("paths") || [];
  }

  getAllMasksForLayer(layerId: string): LayerFrameMask[] {
    const yMasks = this.layerFrameMasks.filter(
      (mask) => mask.get("layerId") === layerId
    );
    return yMasks.map((mask) => mask.toObjectSafe() as LayerFrameMask);
  }

  getAllMasksForFrame(frameId: string): LayerFrameMask[] {
    const yMasks = this.layerFrameMasks.filter(
      (mask) => mask.get("frameId") === frameId
    );
    return yMasks.map((mask) => mask.toObjectSafe() as LayerFrameMask);
  }

  private removeAllMasksForLayer(layerId: string): void {
    const masksToRemove = this.layerFrameMasks.filter(
      (mask) => mask.get("layerId") === layerId
    );
    masksToRemove.forEach((_, index) => {
      const actualIndex = this.layerFrameMasks.findIndex(
        (mask) => mask.get("layerId") === layerId
      );
      if (actualIndex !== -1) {
        this.layerFrameMasks.delete(actualIndex);
      }
    });
  }

  private removeAllMasksForFrame(frameId: string): void {
    const masksToRemove = this.layerFrameMasks.filter(
      (mask) => mask.get("frameId") === frameId
    );
    masksToRemove.forEach((_, index) => {
      const actualIndex = this.layerFrameMasks.findIndex(
        (mask) => mask.get("frameId") === frameId
      );
      if (actualIndex !== -1) {
        this.layerFrameMasks.delete(actualIndex);
      }
    });
  }

  // User Selection Management - Now using Awareness
  setUserSelection(userId: string, selection: Partial<UserSelection>): void {
    const currentLocalState = this.awareness.getLocalState() || {};
    const currentSelection =
      (currentLocalState.selection as UserSelection) || {};

    const selectionData: UserSelection = {
      userId,
      selectedLayerId: null,
      selectedFrameId: null,
      selectedPathIds: [],
      selectedPointIndices: [],
      ...currentSelection,
      ...selection,
    };

    // Set the selection in awareness local state
    this.awareness.setLocalStateField("selection", selectionData);
  }

  getUserSelection(userId: string): UserSelection | undefined {
    // Get from awareness states
    const states = this.awareness.getStates();

    for (const [clientId, state] of states) {
      const selection = state.selection as UserSelection;
      if (selection && selection.userId === userId) {
        return selection;
      }
    }

    return undefined;
  }

  clearUserSelection(userId: string): boolean {
    const currentLocalState = this.awareness.getLocalState() || {};
    const currentSelection = currentLocalState.selection as UserSelection;

    // Only clear if the current local state belongs to this user
    if (currentSelection && currentSelection.userId === userId) {
      this.awareness.setLocalStateField("selection", null);
      return true;
    }

    return false;
  }

  /**
   * Get all user selections from all clients
   * @returns Array of all current user selections
   */
  getAllUserSelections(): UserSelection[] {
    const states = this.awareness.getStates();
    const selections: UserSelection[] = [];

    for (const [clientId, state] of states) {
      const selection = state.selection as UserSelection;
      if (selection) {
        selections.push(selection);
      }
    }

    return selections;
  }

  /**
   * Subscribe to changes in user selections across all clients
   * @param callback Function to call when selections change
   * @returns Unsubscribe function
   */
  onUserSelectionsChange(
    callback: (selections: UserSelection[]) => void
  ): () => void {
    const handler = () => {
      callback(this.getAllUserSelections());
    };

    this.awareness.on("change", handler);

    // Return unsubscribe function
    return () => {
      this.awareness.off("change", handler);
    };
  }

  private clearLayerFromAllSelections(layerId: string): void {
    const currentLocalState = this.awareness.getLocalState() || {};
    const currentSelection = currentLocalState.selection as UserSelection;

    if (currentSelection && currentSelection.selectedLayerId === layerId) {
      this.setUserSelection(currentSelection.userId, {
        selectedLayerId: null,
        selectedPathIds: [],
        selectedPointIndices: [],
      });
    }

    // Note: We can only modify our own local state in awareness.
    // Other clients will need to handle their own cleanup when they
    // observe the layer deletion through document changes.
  }

  private clearFrameFromAllSelections(frameId: string): void {
    const currentLocalState = this.awareness.getLocalState() || {};
    const currentSelection = currentLocalState.selection as UserSelection;

    if (currentSelection && currentSelection.selectedFrameId === frameId) {
      this.setUserSelection(currentSelection.userId, {
        selectedFrameId: null,
      });
    }
  }

  private clearPathFromAllSelections(pathId: string): void {
    const currentLocalState = this.awareness.getLocalState() || {};
    const currentSelection = currentLocalState.selection as UserSelection;

    if (currentSelection && currentSelection.selectedPathIds.includes(pathId)) {
      const updatedPathIds = currentSelection.selectedPathIds.filter(
        (id) => id !== pathId
      );
      this.setUserSelection(currentSelection.userId, {
        selectedPathIds: updatedPathIds,
        selectedPointIndices: [], // Clear point indices when path is removed
      });
    }
  }

  // Utility Methods
  exportProject(): {
    project: Project;
    frames: Frame[];
    layers: Layer[];
    masks: LayerFrameMask[];
  } {
    return {
      project: this.project.toObjectSafe() as Project,
      frames: this.frames.toObjectArraySafe() as Frame[],
      layers: this.layers.toObjectArraySafe() as Layer[],
      masks: this.layerFrameMasks.toObjectArraySafe() as LayerFrameMask[],
    };
  }

  // Point manipulation helpers for bezier paths
  addPointToPath(
    layerId: string,
    frameId: string,
    pathId: string,
    point: BezierPoint
  ): boolean {
    const paths = this.getLayerFrameMasks(layerId, frameId);
    const pathIndex = paths.findIndex((p) => p.id === pathId);

    if (pathIndex === -1) return false;

    const updatedPath = {
      ...paths[pathIndex],
      points: [...paths[pathIndex].points, point],
    };

    return this.updatePath(layerId, frameId, pathId, updatedPath);
  }

  updatePointInPath(
    layerId: string,
    frameId: string,
    pathId: string,
    pointIndex: number,
    pointUpdate: Partial<BezierPoint>
  ): boolean {
    const paths = this.getLayerFrameMasks(layerId, frameId);
    const pathIndex = paths.findIndex((p) => p.id === pathId);

    if (pathIndex === -1 || pointIndex >= paths[pathIndex].points.length)
      return false;

    const updatedPoints = [...paths[pathIndex].points];
    updatedPoints[pointIndex] = {
      ...updatedPoints[pointIndex],
      ...pointUpdate,
    };

    const updatedPath = {
      ...paths[pathIndex],
      points: updatedPoints,
    };

    return this.updatePath(layerId, frameId, pathId, updatedPath);
  }

  removePointFromPath(
    layerId: string,
    frameId: string,
    pathId: string,
    pointIndex: number
  ): boolean {
    const paths = this.getLayerFrameMasks(layerId, frameId);
    const pathIndex = paths.findIndex((p) => p.id === pathId);

    if (pathIndex === -1 || pointIndex >= paths[pathIndex].points.length)
      return false;

    const updatedPoints = paths[pathIndex].points.filter(
      (_, index) => index !== pointIndex
    );

    const updatedPath = {
      ...paths[pathIndex],
      points: updatedPoints,
    };

    return this.updatePath(layerId, frameId, pathId, updatedPath);
  }

  closePathIfValid(layerId: string, frameId: string, pathId: string): boolean {
    const paths = this.getLayerFrameMasks(layerId, frameId);
    const path = paths.find((p) => p.id === pathId);

    if (!path || path.points.length < 3) return false; // Need at least 3 points to close

    return this.updatePath(layerId, frameId, pathId, { closed: true });
  }

  /**
   * Get the awareness instance for advanced usage
   * @returns The awarenessProtocol.Awareness instance
   */
  getAwareness(): awarenessProtocol.Awareness {
    return this.awareness;
  }
}
