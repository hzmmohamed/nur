import { TypedYMap, TypedYArrayOfMaps } from "../yjs-utils/typed-wrappers";
import type {
  Project,
  Frame,
  Layer,
  LayerFrameMask,
  UserSelection,
  BezierPath,
  BezierPoint,
} from "./types"; // Assuming types are exported from a types file

import {
  FrameSchema,
  LayerFrameMaskSchema,
  LayerSchema,
  ProjectSchema,
  UserSelectionSchema,
} from "./types";
/**
 * Interface for a collaborative video editing project with frame-based layers and bezier masking
 */
export class VideoEditingProject {
  // Core data structures
  public readonly project: TypedYMap<Project>;
  public readonly frames: TypedYArrayOfMaps<Frame>;
  public readonly layers: TypedYArrayOfMaps<Layer>;
  public readonly layerFrameMasks: TypedYArrayOfMaps<LayerFrameMask>;
  public readonly userSelections: TypedYArrayOfMaps<UserSelection>;

  constructor(private readonly ydoc: Y.Doc, projectData?: Partial<Project>) {
    // Initialize typed Yjs structures
    this.project = new TypedYMap(ydoc.getMap("project"), ProjectSchema);
    this.frames = new TypedYArrayOfMaps(ydoc.getArray("frames"), FrameSchema);
    this.layers = new TypedYArrayOfMaps(ydoc.getArray("layers"), LayerSchema);
    this.layerFrameMasks = new TypedYArrayOfMaps(
      ydoc.getArray("layerFrameMasks"),
      LayerFrameMaskSchema
    );
    this.userSelections = new TypedYArrayOfMaps(
      ydoc.getArray("userSelections"),
      UserSelectionSchema
    );

    // Initialize project if data provided
    if (projectData) {
      this.initializeProject(projectData);
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

  updateProject(updates: Partial<Project>): void {
    this.project.update({
      ...updates,
      lastModified: Date.now(),
    });
  }

  // Frame Management
  addFrame(frameData: Partial<Frame>): TypedYMap<Frame> {
    const frame: Frame = {
      id: crypto.randomUUID(),
      index: frameData.index ?? this.getNextFrameIndex(),
      ...frameData,
    };

    return this.frames.addItem(frame);
  }

  getFrame(frameId: string): TypedYMap<Frame> | undefined {
    return this.frames.find((frame) => frame.get("id") === frameId);
  }

  removeFrame(frameId: string): boolean {
    // Also remove all associated layer-frame masks
    this.removeAllMasksForFrame(frameId);
    return this.frames.removeWhere((frame) => frame.get("id") === frameId);
  }

  getAllFrames(): TypedYMap<Frame>[] {
    return this.frames.toArray();
  }

  getFramesSortedByIndex(): TypedYMap<Frame>[] {
    return this.frames.toArray().sort((a, b) => {
      const indexA = a.get("index") ?? 0;
      const indexB = b.get("index") ?? 0;
      return indexA - indexB;
    });
  }

  getNextFrameIndex(): number {
    const frames = this.frames.toArray();
    if (frames.length === 0) return 0;

    const maxIndex = Math.max(
      ...frames.map((frame) => frame.get("index") ?? 0)
    );
    return maxIndex + 1;
  }

  insertFrameAtIndex(
    index: number,
    frameData: Partial<Frame>
  ): TypedYMap<Frame> {
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

    return this.frames.addItem(frame);
  }

  reorderFrame(frameId: string, newIndex: number): boolean {
    const frame = this.getFrame(frameId);
    if (!frame) return false;

    const oldIndex = frame.get("index") ?? 0;
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
    frame.set("index", newIndex);
    return true;
  }

  // Layer Management
  addLayer(layerData: Partial<Layer>): TypedYMap<Layer> {
    const layer: Layer = {
      id: crypto.randomUUID(),
      name: layerData.name || `Layer ${this.layers.length() + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      ...layerData,
    };

    return this.layers.addItem(layer);
  }

  getLayer(layerId: string): TypedYMap<Layer> | undefined {
    return this.layers.find((layer) => layer.get("id") === layerId);
  }

  removeLayer(layerId: string): boolean {
    // Remove all associated layer-frame masks
    this.removeAllMasksForLayer(layerId);
    // Update user selections
    this.clearLayerFromSelections(layerId);
    return this.layers.removeWhere((layer) => layer.get("id") === layerId);
  }

  getAllLayers(): TypedYMap<Layer>[] {
    return this.layers.toArray();
  }

  // Bezier Path and Mask Management
  addPathToLayerFrame(
    layerId: string,
    frameId: string,
    pathData: Partial<BezierPath>
  ): boolean {
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
  }

  updatePath(
    layerId: string,
    frameId: string,
    pathId: string,
    updates: Partial<BezierPath>
  ): boolean {
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
  }

  removePath(layerId: string, frameId: string, pathId: string): boolean {
    const mask = this.layerFrameMasks.find(
      (mask) =>
        mask.get("layerId") === layerId && mask.get("frameId") === frameId
    );

    if (!mask) return false;

    const paths = mask.get("paths") || [];
    const filteredPaths = paths.filter((path) => path.id !== pathId);

    if (filteredPaths.length === paths.length) return false;

    mask.set("paths", filteredPaths);
    return true;
  }

  getLayerFrameMasks(layerId: string, frameId: string): BezierPath[] {
    const mask = this.layerFrameMasks.find(
      (mask) =>
        mask.get("layerId") === layerId && mask.get("frameId") === frameId
    );

    return mask?.get("paths") || [];
  }

  getAllMasksForLayer(layerId: string): TypedYMap<LayerFrameMask>[] {
    return this.layerFrameMasks.filter(
      (mask) => mask.get("layerId") === layerId
    );
  }

  getAllMasksForFrame(frameId: string): TypedYMap<LayerFrameMask>[] {
    return this.layerFrameMasks.filter(
      (mask) => mask.get("frameId") === frameId
    );
  }

  private removeAllMasksForLayer(layerId: string): void {
    const masksToRemove = this.getAllMasksForLayer(layerId);
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
    const masksToRemove = this.getAllMasksForFrame(frameId);
    masksToRemove.forEach((_, index) => {
      const actualIndex = this.layerFrameMasks.findIndex(
        (mask) => mask.get("frameId") === frameId
      );
      if (actualIndex !== -1) {
        this.layerFrameMasks.delete(actualIndex);
      }
    });
  }

  // User Selection Management
  setUserSelection(userId: string, selection: Partial<UserSelection>): void {
    const existingSelection = this.userSelections.find(
      (sel) => sel.get("userId") === userId
    );

    const selectionData: UserSelection = {
      userId,
      selectedLayerId: null,
      selectedFrameId: null,
      selectedPathIds: [],
      selectedPointIndices: [],
      ...selection,
    };

    if (existingSelection) {
      existingSelection.update(selectionData);
    } else {
      this.userSelections.addItem(selectionData);
    }
  }

  getUserSelection(userId: string): TypedYMap<UserSelection> | undefined {
    return this.userSelections.find((sel) => sel.get("userId") === userId);
  }

  clearUserSelection(userId: string): boolean {
    return this.userSelections.removeWhere(
      (sel) => sel.get("userId") === userId
    );
  }

  private clearLayerFromSelections(layerId: string): void {
    this.userSelections.toArray().forEach((selection) => {
      if (selection.get("selectedLayerId") === layerId) {
        selection.set("selectedLayerId", null);
        selection.set("selectedPathIds", []);
        selection.set("selectedPointIndices", []);
      }
    });
  }

  // Utility Methods
  exportProject(): {
    project: Partial<Project>;
    frames: Partial<Frame>[];
    layers: Partial<Layer>[];
    masks: Partial<LayerFrameMask>[];
  } {
    return {
      project: this.project.toObjectSafe(),
      frames: this.frames.toObjectArraySafe(),
      layers: this.layers.toObjectArraySafe(),
      masks: this.layerFrameMasks.toObjectArraySafe(),
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
}
