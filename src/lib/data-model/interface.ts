import type {
  Project,
  Frame,
  Layer,
  LayerFrameMask,
  UserSelection,
  BezierPath,
  Point,
} from "./types";

/**
 * Interface for managing project-level operations
 */
export interface IProjectManager {
  /**
   * Updates project metadata and automatically sets lastModified timestamp
   */
  updateProject(updates: Partial<Project>): void;

  /**
   * Exports the entire project data as plain objects
   * @returns Object containing all project data
   */
  exportProject(): {
    project: Project;
    frames: Frame[];
    layers: Layer[];
    masks: LayerFrameMask[];
  };
}

/**
 * Interface for managing frames in the video project
 */
export interface IFrameManager {
  /**
   * Adds a new frame to the project
   * @param frameData Partial frame data (id and index will be auto-generated if not provided)
   * @returns The created frame
   */
  addFrame(frameData: Partial<Frame>): Frame;

  /**
   * Retrieves a frame by its ID
   * @param frameId The frame ID to search for
   * @returns The frame if found, undefined otherwise
   */
  getFrame(frameId: string): Frame | undefined;

  /**
   * Removes a frame and all its associated masks
   * @param frameId The frame ID to remove
   * @returns True if frame was removed, false if not found
   */
  removeFrame(frameId: string): boolean;

  /**
   * Gets all frames in the project
   * @returns Array of all frames
   */
  getAllFrames(): Frame[];

  /**
   * Gets all frames sorted by their index property
   * @returns Array of frames sorted by index
   */
  getFramesSortedByIndex(): Frame[];

  /**
   * Calculates the next available frame index
   * @returns The next frame index number
   */
  getNextFrameIndex(): number;

  /**
   * Inserts a frame at a specific index, shifting existing frames as needed
   * @param index The index position to insert at
   * @param frameData Partial frame data
   * @returns The created frame
   */
  insertFrameAtIndex(index: number, frameData: Partial<Frame>): Frame;

  /**
   * Reorders a frame to a new index position
   * @param frameId The frame to reorder
   * @param newIndex The new index position
   * @returns True if reordering was successful
   */
  reorderFrame(frameId: string, newIndex: number): boolean;
}

/**
 * Interface for managing layers in the video project
 */
export interface ILayerManager {
  /**
   * Adds a new layer to the project
   * @param layerData Partial layer data (id and name will be auto-generated if not provided)
   * @returns The created layer
   */
  addLayer(layerData: Partial<Layer>): Layer;

  /**
   * Retrieves a layer by its ID
   * @param layerId The layer ID to search for
   * @returns The layer if found, undefined otherwise
   */
  getLayer(layerId: string): Layer | undefined;

  /**
   * Removes a layer and all its associated masks and selections
   * @param layerId The layer ID to remove
   * @returns True if layer was removed, false if not found
   */
  removeLayer(layerId: string): boolean;

  /**
   * Gets all layers in the project
   * @returns Array of all layers
   */
  getAllLayers(): Layer[];

  /**
   * Updates an existing layer's properties
   * @param layerId The layer ID to update
   * @param updates Partial layer updates
   * @returns True if layer was updated successfully, false if layer not found
   */
  updateLayer(layerId: string, updates: Partial<Layer>): boolean;
}

/**
 * Interface for managing bezier paths and masks on layer-frame combinations
 */
export interface IMaskManager {
  /**
   * Adds a bezier path to a specific layer-frame combination
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @param pathData Partial path data (id will be auto-generated if not provided)
   * @returns True if path was added successfully
   */
  addPathToLayerFrame(
    layerId: string,
    frameId: string,
    pathData: Partial<BezierPath>
  ): boolean;

  /**
   * Updates an existing bezier path
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @param pathId The path ID to update
   * @param updates Partial path updates
   * @returns True if path was updated successfully
   */
  updatePath(
    layerId: string,
    frameId: string,
    pathId: string,
    updates: Partial<BezierPath>
  ): boolean;

  /**
   * Removes a bezier path from a layer-frame combination
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @param pathId The path ID to remove
   * @returns True if path was removed successfully
   */
  removePath(layerId: string, frameId: string, pathId: string): boolean;

  /**
   * Gets all bezier paths for a specific layer-frame combination
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @returns Array of bezier paths
   */
  getLayerFrameMasks(layerId: string, frameId: string): BezierPath[];

  /**
   * Gets all masks associated with a specific layer across all frames
   * @param layerId The layer ID
   * @returns Array of layer-frame masks
   */
  getAllMasksForLayer(layerId: string): LayerFrameMask[];

  /**
   * Gets all masks associated with a specific frame across all layers
   * @param frameId The frame ID
   * @returns Array of layer-frame masks
   */
  getAllMasksForFrame(frameId: string): LayerFrameMask[];

  /**
   * Adds a point to an existing bezier path
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @param pathId The path ID
   * @param point The point to add
   * @returns True if point was added successfully
   */
  addPointToPath(
    layerId: string,
    frameId: string,
    pathId: string,
    point: Point
  ): boolean;

  /**
   * Updates a specific point in a bezier path
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @param pathId The path ID
   * @param pointIndex The index of the point to update
   * @param pointUpdate Partial point updates
   * @returns True if point was updated successfully
   */
  updatePointInPath(
    layerId: string,
    frameId: string,
    pathId: string,
    pointIndex: number,
    pointUpdate: Partial<Point>
  ): boolean;

  /**
   * Removes a point from a bezier path
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @param pathId The path ID
   * @param pointIndex The index of the point to remove
   * @returns True if point was removed successfully
   */
  removePointFromPath(
    layerId: string,
    frameId: string,
    pathId: string,
    pointIndex: number
  ): boolean;

  /**
   * Closes a bezier path if it has enough points (minimum 3)
   * @param layerId The layer ID
   * @param frameId The frame ID
   * @param pathId The path ID to close
   * @returns True if path was closed successfully
   */
  closePathIfValid(layerId: string, frameId: string, pathId: string): boolean;
}

/**
 * Interface for managing user selections in collaborative editing
 */
export interface ISelectionManager {
  /**
   * Sets or updates a user's selection state
   * @param userId The user ID
   * @param selection Partial selection data
   */
  setUserSelection(userId: string, selection: Partial<UserSelection>): void;

  /**
   * Gets a user's current selection state
   * @param userId The user ID
   * @returns The user's selection if found, undefined otherwise
   */
  getUserSelection(userId: string): UserSelection | undefined;

  /**
   * Clears a user's selection state
   * @param userId The user ID
   * @returns True if selection was cleared, false if user had no selection
   */
  clearUserSelection(userId: string): boolean;
}

/**
 * Composite interface that combines all video editing functionality
 */
export interface IVideoEditingProject
  extends IProjectManager,
    IFrameManager,
    ILayerManager,
    IMaskManager,
    ISelectionManager {}
