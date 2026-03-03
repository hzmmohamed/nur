import type { BezierPoint, Bounds } from "./coordinate-utils";

export interface ICubicBezierPath {
  readonly pointCount: number;
  readonly closed: boolean;

  getBounds(): Bounds | null;
  isClosed(): boolean;
  getPointCount(): number;
  getAllPoints(): BezierPoint[];
  getPoint(index: number): BezierPoint | undefined;

  setClosed(closed: boolean): void;

  addPoint(point: BezierPoint): void;
  insertPoint(index: number, point: BezierPoint): void;
  removePoint(index: number): boolean;

  updatePoint(index: number, updates: Partial<BezierPoint>): boolean;
  movePoint(index: number, x: number, y: number): boolean;

  setPointHandleIn(index: number, angle: number, distance: number): boolean;
  setPointHandleOut(index: number, angle: number, distance: number): boolean;
  removePointHandleIn(index: number): boolean;
  removePointHandleOut(index: number): boolean;

  setPointHandleInCartesian(
    index: number,
    handleX: number,
    handleY: number
  ): boolean;
  setPointHandleOutCartesian(
    index: number,
    handleX: number,
    handleY: number
  ): boolean;

  setPoints(points: BezierPoint[]): void;
  clear(): void;

  clone(): ICubicBezierPath;
}

export interface IClosedCubicBezierPath extends ICubicBezierPath {
  readonly closed: true;
  readonly pointCount: number;

  getBounds(): Bounds;
  isClosed(): boolean;
  setClosed(closed: boolean): void;
  removePoint(index: number): boolean;
  setPoints(points: BezierPoint[]): void;
  clear(): void;

  clone(): IClosedCubicBezierPath;
}

/**
 * Entity Interfaces for Animation Domain Model
 */

// ============================================================================
// Shared Behavior Interfaces
// ============================================================================

export interface Identifiable {
  readonly id: string;
}

export interface Named {
  name: string;
}

export interface Visible {
  visible: boolean;
}

export interface Ordered {
  order: number; // Z-index / stacking order
}

// ============================================================================
// Frame Interface
// ============================================================================

export interface IAnimationFrame extends Identifiable, Ordered {
  index: number; // Frame number in sequence (0, 1, 2, ...)
  timestamp: number; // Time in milliseconds from animation start
  duration?: number; // Frame display duration (for variable frame rates)
  thumbnailUrl?: string; // Reference frame image URL
  metadata?: Record<string, any>;

  clone(): IAnimationFrame;
}

// ============================================================================
// Masking Interfaces
// ============================================================================

export interface IMaskingShape extends Identifiable {
  readonly frameId: string; // Which animation frame this shape belongs to

  // Path Access
  getPath(): IClosedCubicBezierPath;

  // Computed Properties
  getBounds(): Bounds;

  // Cloning
  clone(): IMaskingShape;
}

export interface IMaskingLayer extends Identifiable, Named, Visible, Ordered {
  color?: string; // Display color for UI
  metadata?: Record<string, any>;

  // Shape Management
  createShapeForFrame(frameId: string, points: BezierPoint[]): IMaskingShape;
  createShapeForFrameFromPath(
    frameId: string,
    path: IClosedCubicBezierPath
  ): IMaskingShape;
  addShapeToFrame(frameId: string, shape: IMaskingShape): void;
  removeShapeFromFrame(frameId: string, shapeId: string): boolean;
  removeAllShapesForFrame(frameId: string): boolean;

  // Shape Queries
  getShapesForFrame(frameId: string): IMaskingShape[];
  getShapeById(frameId: string, shapeId: string): IMaskingShape | undefined;
  getDefinedFrameIds(): string[];
  hasShapesForFrame(frameId: string): boolean;
  getTotalShapeCount(): number;
  getShapeCountForFrame(frameId: string): number;

  // Cloning
  clone(): IMaskingLayer;
}

// ============================================================================
// Lighting Interfaces
// ============================================================================

export type FalloffType = "linear" | "exponential" | "smooth";

export interface ILightingLayerShape extends Identifiable {
  readonly frameId: string;
  baseColor: string; // Color (hex/rgb/rgba)
  intensity: number; // 0-1, brightness
  falloffType: FalloffType;

  // Path Access
  getInnerPath(): IClosedCubicBezierPath;
  getOuterPath(): IClosedCubicBezierPath;

  // Validation
  isValid(): boolean; // Inner path must fit within outer path bounds
  getInnerBounds(): Bounds;
  getOuterBounds(): Bounds;

  // Cloning
  clone(): ILightingLayerShape;
}

export type BlendModeType =
  | "normal"
  | "add"
  | "multiply"
  | "screen"
  | "overlay";

export interface ILightingLayer extends Identifiable, Named, Visible, Ordered {
  readonly maskingLayerId: string; // Which masking layer this lights
  blendMode: BlendModeType;
  opacity: number; // 0-1, overall layer opacity
  metadata?: Record<string, any>;

  // Shape Management
  createShapeForFrame(
    frameId: string,
    innerPath: IClosedCubicBezierPath,
    outerPath: IClosedCubicBezierPath,
    baseColor: string,
    options?: {
      intensity?: number;
      falloffType?: FalloffType;
    }
  ): ILightingLayerShape;
  addShapeToFrame(frameId: string, shape: ILightingLayerShape): void;
  removeShapeFromFrame(frameId: string, shapeId: string): boolean;
  removeAllShapesForFrame(frameId: string): boolean;

  // Shape Queries
  getShapesForFrame(frameId: string): ILightingLayerShape[];
  getShapeById(
    frameId: string,
    shapeId: string
  ): ILightingLayerShape | undefined;
  getDefinedFrameIds(): string[];
  hasShapesForFrame(frameId: string): boolean;
  getTotalShapeCount(): number;
  getShapeCountForFrame(frameId: string): number;

  // Cloning
  clone(): ILightingLayer;
}

// ============================================================================
// Transaction and Undo/Redo Types
// ============================================================================

export interface TransactionMetadata {
  description: string;
  type: string;
  timestamp: number;
  operationCount: number;
  targetId?: string;
  targetName?: string;
}

export interface UndoRedoState {
  canUndo: boolean;
  canRedo: boolean;
  undoStackSize: number;
  redoStackSize: number;
  lastOperation?: TransactionMetadata;
}

// ============================================================================
// Project Interface
// ============================================================================

export interface IAnimationProject extends Identifiable, Named {
  frameRate: number; // Frames per second
  width: number; // Canvas width
  height: number; // Canvas height
  metadata?: Record<string, any>;

  // Frame Management
  createFrame(
    index: number,
    timestamp: number,
    options?: Partial<IAnimationFrame>
  ): IAnimationFrame;
  addFrame(frame: IAnimationFrame): void;
  removeFrame(frameId: string): boolean;
  getFrameByIndex(index: number): IAnimationFrame | undefined;
  getFrameById(id: string): IAnimationFrame | undefined;
  getAllFrames(): IAnimationFrame[];
  getFramesSortedByIndex(): IAnimationFrame[];
  getTotalDuration(): number; // Total animation duration in milliseconds

  // Masking Layer Management
  createMaskingLayer(
    name: string,
    options?: Partial<IMaskingLayer>
  ): IMaskingLayer;
  addMaskingLayer(layer: IMaskingLayer): void;
  removeMaskingLayer(layerId: string): boolean;
  getMaskingLayerById(id: string): IMaskingLayer | undefined;
  getAllMaskingLayers(): IMaskingLayer[];
  getVisibleMaskingLayers(): IMaskingLayer[]; // Visible only, sorted by order

  // Lighting Layer Management
  createLightingLayer(
    maskingLayerId: string,
    name: string,
    options?: Partial<ILightingLayer>
  ): ILightingLayer;
  addLightingLayer(layer: ILightingLayer): void;
  removeLightingLayer(layerId: string): boolean;
  getLightingLayerById(id: string): ILightingLayer | undefined;
  getAllLightingLayers(): ILightingLayer[];
  getLightingLayersForMask(maskingLayerId: string): ILightingLayer[]; // Sorted by order
  getVisibleLightingLayersForMask(maskingLayerId: string): ILightingLayer[]; // Visible, sorted by order

  // Transaction Control
  beginTransaction(
    description: string,
    metadata?: Partial<TransactionMetadata>
  ): void;
  commitTransaction(): void;
  rollbackTransaction(): void;
  isInTransaction(): boolean;

  // Undo/Redo
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getUndoRedoState(): UndoRedoState;
  onUndoRedoStateChange(callback: (state: UndoRedoState) => void): () => void;
  clearUndoHistory(): void;
  getTransactionHistory(): TransactionMetadata[];
}
