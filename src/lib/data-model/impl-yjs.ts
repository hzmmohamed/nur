import * as Y from "yjs";
import { TypedYMap, TypedYArrayOfMaps } from "../yjs-utils/typed-wrappers";
import {
  type Point,
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
  UserSelectionSchema,
} from "./types";
import type { IVideoEditingProject } from "./interface";

export class VideoEditingProject implements IVideoEditingProject {
  // Core data structures (private)
  private readonly project: TypedYMap<Project>;
  private readonly frames: TypedYArrayOfMaps<Frame>;
  private readonly layers: TypedYArrayOfMaps<Layer>;
  private readonly layerFrameMasks: TypedYArrayOfMaps<LayerFrameMask>;
  private readonly userSelections: TypedYArrayOfMaps<UserSelection>;

  constructor(readonly ydoc: Y.Doc, projectData?: Partial<Project>) {
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
  addFrame(frameData: Partial<Frame>): Frame {
    const frame: Frame = {
      id: crypto.randomUUID(),
      index: frameData.index ?? this.getNextFrameIndex(),
      ...frameData,
    };

    const yFrame = this.frames.addItem(frame);
    return yFrame.toObjectSafe() as Frame;
  }

  getFrame(frameId: string): Frame | undefined {
    const yFrame = this.frames.find((frame) => frame.get("id") === frameId);
    return yFrame ? (yFrame.toObjectSafe() as Frame) : undefined;
  }

  removeFrame(frameId: string): boolean {
    // Also remove all associated layer-frame masks
    this.removeAllMasksForFrame(frameId);
    return this.frames.removeWhere((frame) => frame.get("id") === frameId);
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
  }

  reorderFrame(frameId: string, newIndex: number): boolean {
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
  }

  // Layer Management
  addLayer(layerData: Partial<Layer>): Layer {
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
  }

  updateLayer(layerId: string, updates: Partial<Layer>): boolean {
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
  }

  getLayer(layerId: string): Layer | undefined {
    const yLayer = this.layers.find((layer) => layer.get("id") === layerId);
    return yLayer ? (yLayer.toObjectSafe() as Layer) : undefined;
  }

  removeLayer(layerId: string): boolean {
    // Remove all associated layer-frame masks
    this.removeAllMasksForLayer(layerId);
    // Update user selections
    this.clearLayerFromSelections(layerId);
    return this.layers.removeWhere((layer) => layer.get("id") === layerId);
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
    point: Point
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
    pointUpdate: Partial<Point>
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

// // User Selection Management
// setUserSelection(userId: string, selection: Partial<UserSelection>): void {
//   const existingSelection = this.userSelections.find(
//     (sel) => sel.get("userId") === userId
//   );

//   const selectionData: UserSelection = {
//     userId,
//     selectedLayerId: null,
//     selectedFrameId: null,
//     selectedPathIds: [],
//     selectedPointIndices: [],
//     ...selection,
//   };

//   if (existingSelection) {
//     existingSelection.update(selectionData);
//   } else {
//     this.userSelections.addItem(selectionData);
//   }
// }

// getUserSelection(userId: string): UserSelection | undefined {
//   const ySelection = this.userSelections.find(
//     (sel) => sel.get("userId") === userId
//   );
//   return ySelection
//     ? (ySelection.toObjectSafe() as UserSelection)
//     : undefined;
// }

// clearUserSelection(userId: string): boolean {
//   return this.userSelections.removeWhere(
//     (sel) => sel.get("userId") === userId
//   );
// }

// private clearLayerFromSelections(layerId: string): void {
//   this.userSelections.toArray().forEach((selection) => {
//     if (selection.get("selectedLayerId") === layerId) {
//       selection.set("selectedLayerId", null);
//       selection.set("selectedPathIds", []);
//       selection.set("selectedPointIndices", []);
//     }
//   });
// }
