import Konva from "konva";
import type { Stage } from "konva/lib/Stage";
import type { Layer } from "konva/lib/Layer";
import type { BezierPoint, BezierPath } from "../data-model/types";
import type { VideoEditingProject } from "../data-model/impl-yjs-v2";

// ============================================================================
// DECOMPOSED ARCHITECTURE OVERVIEW
// ============================================================================

/**
 * Architecture:
 *
 * PenTool (Main Coordinator)
 *   ├── PathDrawer          - Handles path creation and point placement
 *   ├── PathEditor          - Handles editing existing closed paths
 *   ├── PathRenderer        - Renders paths to Konva
 *   ├── ControlsRenderer    - Renders interactive controls (points, handles)
 *   ├── InteractionHandler  - Processes mouse/keyboard events
 *   ├── GeometryHelper      - Bezier math and geometry calculations
 *   └── PersistenceManager  - Syncs with VideoEditingProject
 *
 * Benefits:
 * - Single Responsibility: Each class has one clear purpose
 * - Easy to test: Mock dependencies, test in isolation
 * - Easy to extend: Add new features without touching existing code
 * - Reusable: Components can be used independently
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface PenToolConfig {
  closeZoneRadius: number;
  snapToAngle: boolean;
  snapToGrid: boolean;
  gridSize: number;
  handleLength: number;
}

export type PenToolMode = "idle" | "drawing" | "editing";

export interface PenToolState {
  mode: PenToolMode;
  activeLayerId: string | null;
  activeFrameId: string | null;
}

// ============================================================================
// 1. GEOMETRY HELPER - Pure functions for bezier math
// ============================================================================

export class GeometryHelper {
  /**
   * Calculate distance between two points
   */
  static distance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate angle between two points
   */
  static angle(p1: Point, p2: Point): number {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  /**
   * Check if point is within radius of target
   */
  static isNear(point: Point, target: Point, radius: number): boolean {
    return this.distance(point, target) <= radius;
  }

  /**
   * Constrain angle to 45-degree increments
   */
  static constrainAngle(point: Point, anchor: Point): Point {
    const angle = this.angle(anchor, point);
    const distance = this.distance(anchor, point);

    // Round to nearest 45 degrees (π/4 radians)
    const constrainedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

    return {
      x: anchor.x + Math.cos(constrainedAngle) * distance,
      y: anchor.y + Math.sin(constrainedAngle) * distance,
    };
  }

  /**
   * Snap point to grid
   */
  static snapToGrid(point: Point, gridSize: number): Point {
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    };
  }

  /**
   * Create symmetric handles for a smooth point
   */
  static createSymmetricHandles(
    position: Point,
    handleDirection: number,
    length: number
  ): { handleIn: Point; handleOut: Point } {
    const handleOut = {
      x: Math.cos(handleDirection) * length,
      y: Math.sin(handleDirection) * length,
    };
    const handleIn = {
      x: -handleOut.x,
      y: -handleOut.y,
    };
    return { handleIn, handleOut };
  }

  /**
   * Convert bezier points to SVG path data
   */
  static toSVGPath(points: BezierPoint[]): string {
    if (points.length === 0) return "";

    let path = `M ${points[0].position.x} ${points[0].position.y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      if (prev.handleOut && curr.handleIn) {
        // Cubic bezier curve
        const cp1x = prev.position.x + prev.handleOut.x;
        const cp1y = prev.position.y + prev.handleOut.y;
        const cp2x = curr.position.x + curr.handleIn.x;
        const cp2y = curr.position.y + curr.handleIn.y;

        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.position.x} ${curr.position.y}`;
      } else {
        // Straight line
        path += ` L ${curr.position.x} ${curr.position.y}`;
      }
    }

    // Close the path
    path += " Z";
    return path;
  }

  /**
   * Calculate point on bezier curve at parameter t (0 to 1)
   */
  static pointOnCubicBezier(
    p0: Point,
    cp1: Point,
    cp2: Point,
    p1: Point,
    t: number
  ): Point {
    const mt = 1 - t;
    return {
      x:
        mt * mt * mt * p0.x +
        3 * mt * mt * t * cp1.x +
        3 * mt * t * t * cp2.x +
        t * t * t * p1.x,
      y:
        mt * mt * mt * p0.y +
        3 * mt * mt * t * cp1.y +
        3 * mt * t * t * cp2.y +
        t * t * t * p1.y,
    };
  }
}

// ============================================================================
// 2. PATH DRAWER - Handles creating new paths
// ============================================================================
// ============================================================================
// 2. PATH DRAWER - Handles creating new paths
// ============================================================================

export class PathDrawer {
  private points: BezierPoint[] = [];
  private isDrawing = false;
  private isDragging = false;
  private currentDragPoint: Point | null = null;

  constructor(private config: PenToolConfig) {}

  /**
   * Start a new path
   */
  startPath(point: Point): void {
    this.isDrawing = true;
    this.points = [];
    this.addPoint(point, false);
  }

  /**
   * Start dragging to create a curve
   */
  startDrag(point: Point): void {
    this.isDragging = true;
    this.currentDragPoint = point;
  }

  /**
   * Update drag position (call this on mousemove while dragging)
   */
  updateDrag(point: Point): void {
    console.log('drag update')

    if (!this.isDragging || !this.currentDragPoint) return;

    // Calculate handle direction and length from drag
    const lastPoint = this.points[this.points.length - 1];
    if (!lastPoint) return;

    const direction = GeometryHelper.angle(this.currentDragPoint, point);
    const length = GeometryHelper.distance(this.currentDragPoint, point);

    // Update the last point to be smooth with calculated handles
    const handles = GeometryHelper.createSymmetricHandles(
      this.currentDragPoint,
      direction,
      length
    );

    lastPoint.handleIn = handles.handleIn;
    lastPoint.handleOut = handles.handleOut;
  }

  /**
   * End drag and finalize the smooth point
   */
  endDrag(point: Point): void {
    if (!this.isDragging || !this.currentDragPoint) return;

    // Final update with the end position
    this.updateDrag(point);

    this.isDragging = false;
    this.currentDragPoint = null;
  }

  /**
   * Add a corner point (no handles) - used for simple clicks
   */
  addCornerPoint(point: Point): void {
    this.addPoint(point, false);
  }

  /**
   * Add a smooth point with pre-calculated handles
   */
  addSmoothPoint(point: Point, direction: number, length?: number): void {
    const handleLength = length ?? this.config.handleLength;
    const handles = GeometryHelper.createSymmetricHandles(
      point,
      direction,
      handleLength
    );

    this.points.push({
      position: point,
      handleIn: handles.handleIn,
      handleOut: handles.handleOut,
    });
  }

  /**
   * Generic point addition
   */
  private addPoint(point: Point, withHandles: boolean): void {
    if (withHandles) {
      // Calculate direction from previous point
      const direction =
        this.points.length > 0
          ? GeometryHelper.angle(
              this.points[this.points.length - 1].position,
              point
            )
          : 0;
      this.addSmoothPoint(point, direction);
    } else {
      this.points.push({
        position: point,
        handleIn: null,
        handleOut: null,
      });
    }
  }

  /**
   * Check if we can close the path
   */
  canClose(): boolean {
    return this.points.length >= 3;
  }

  /**
   * Check if point is in close zone
   */
  isInCloseZone(point: Point): boolean {
    if (!this.canClose()) return false;
    return GeometryHelper.isNear(
      point,
      this.points[0].position,
      this.config.closeZoneRadius
    );
  }

  /**
   * Close the path and return completed path
   */
  closePath(): BezierPath | null {
    if (!this.canClose()) return null;

    const path: BezierPath = {
      id: crypto.randomUUID(),
      points: [...this.points],
      closed: true,
      visible: true,
    };

    this.reset();
    return path;
  }

  /**
   * Cancel drawing and reset
   */
  cancel(): void {
    this.reset();
  }

  /**
   * Get current points for preview
   */
  getPoints(): BezierPoint[] {
    return [...this.points];
  }

  /**
   * Check if currently drawing
   */
  getIsDrawing(): boolean {
    return this.isDrawing;
  }

  /**
   * Check if currently dragging
   */
  getIsDragging(): boolean {
    return this.isDragging;
  }

  private reset(): void {
    this.points = [];
    this.isDrawing = false;
    this.isDragging = false;
    this.currentDragPoint = null;
  }
}

// ============================================================================
// 3. PATH EDITOR - Handles editing existing paths
// ============================================================================

export class PathEditor {
  private selectedPath: BezierPath | null = null;
  private selectedPointIndices: Set<number> = new Set();
  private dragState: {
    type: "point" | "handle";
    pointIndex: number;
    handleType?: "in" | "out";
    startPos: Point;
  } | null = null;

  /**
   * Select a path for editing
   */
  selectPath(path: BezierPath): void {
    this.selectedPath = path;
    this.selectedPointIndices.clear();
  }

  /**
   * Deselect current path
   */
  deselectPath(): void {
    this.selectedPath = null;
    this.selectedPointIndices.clear();
  }

  /**
   * Select a point (with multi-select support)
   */
  selectPoint(index: number, addToSelection: boolean = false): void {
    if (!addToSelection) {
      this.selectedPointIndices.clear();
    }
    this.selectedPointIndices.add(index);
  }

  /**
   * Move selected points
   */
  movePoint(index: number, newPosition: Point): void {
    if (!this.selectedPath) return;

    this.selectedPath.points[index] = {
      ...this.selectedPath.points[index],
      position: newPosition,
    };
  }

  /**
   * Update a handle
   */
  updateHandle(
    pointIndex: number,
    handleType: "in" | "out",
    handleOffset: Point,
    breakSymmetry: boolean = false
  ): void {
    if (!this.selectedPath) return;

    const point = this.selectedPath.points[pointIndex];

    if (handleType === "out") {
      point.handleOut = handleOffset;
      if (!breakSymmetry && point.handleIn) {
        point.handleIn = { x: -handleOffset.x, y: -handleOffset.y };
      }
    } else {
      point.handleIn = handleOffset;
      if (!breakSymmetry && point.handleOut) {
        point.handleOut = { x: -handleOffset.x, y: -handleOffset.y };
      }
    }
  }

  /**
   * Toggle point type between corner and smooth
   */
  togglePointType(index: number): void {
    if (!this.selectedPath) return;

    const point = this.selectedPath.points[index];

    if (point.handleIn === null && point.handleOut === null) {
      // Convert to smooth
      const handles = GeometryHelper.createSymmetricHandles(
        point.position,
        0,
        30
      );
      point.handleIn = handles.handleIn;
      point.handleOut = handles.handleOut;
    } else {
      // Convert to corner
      point.handleIn = null;
      point.handleOut = null;
    }
  }

  /**
   * Insert point at segment
   */
  insertPoint(segmentIndex: number, point: Point): void {
    if (!this.selectedPath) return;

    const newPoint: BezierPoint = {
      position: point,
      handleIn: { x: 0, y: 0 },
      handleOut: { x: 0, y: 0 },
    };

    this.selectedPath.points.splice(segmentIndex + 1, 0, newPoint);
  }

  /**
   * Delete selected points (if path remains valid)
   */
  deleteSelectedPoints(): boolean {
    if (!this.selectedPath) return false;

    const remainingCount =
      this.selectedPath.points.length - this.selectedPointIndices.size;
    if (remainingCount < 3) return false;

    this.selectedPath.points = this.selectedPath.points.filter(
      (_, index) => !this.selectedPointIndices.has(index)
    );
    this.selectedPointIndices.clear();
    return true;
  }

  /**
   * Get current selected path
   */
  getSelectedPath(): BezierPath | null {
    return this.selectedPath;
  }

  /**
   * Get selected point indices
   */
  getSelectedPointIndices(): Set<number> {
    return new Set(this.selectedPointIndices);
  }

  /**
   * Start dragging operation
   */
  startDrag(
    type: "point" | "handle",
    pointIndex: number,
    startPos: Point,
    handleType?: "in" | "out"
  ): void {
    this.dragState = { type, pointIndex, handleType, startPos };
  }

  /**
   * End dragging operation
   */
  endDrag(): void {
    this.dragState = null;
  }

  /**
   * Get current drag state
   */
  getDragState() {
    return this.dragState;
  }
}

// ============================================================================
// 4. PATH RENDERER - Renders paths to Konva
// ============================================================================

export class PathRenderer {
  constructor(private layer: Layer) {}

  /**
   * Render a completed closed path
   */
  renderClosedPath(path: BezierPath, isSelected: boolean = false): Konva.Path {
    const pathData = GeometryHelper.toSVGPath(path.points);

    const konvaPath = new Konva.Path({
      data: pathData,
      stroke: isSelected ? "#3b82f6" : "#000000",
      strokeWidth: isSelected ? 3 : 2,
      fill: "rgba(59, 130, 246, 0.1)",
      opacity: path.visible ? 1 : 0.3,
    });

    return konvaPath;
  }

  /**
   * Render path preview during drawing
   */
  renderDrawingPreview(points: BezierPoint[], cursorPos: Point): Konva.Group {
    const group = new Konva.Group();

    // Draw points
    points.forEach((point, index) => {
      const circle = new Konva.Circle({
        x: point.position.x,
        y: point.position.y,
        radius: index === 0 ? 8 : 6,
        fill: index === 0 ? "#3b82f6" : "#60a5fa",
        stroke: "#1e40af",
        strokeWidth: 2,
      });
      group.add(circle);
    });

    // Draw connecting lines
    if (points.length > 0) {
      const linePoints: number[] = [];
      points.forEach((p) => {
        linePoints.push(p.position.x, p.position.y);
      });

      const line = new Konva.Line({
        points: linePoints,
        stroke: "#3b82f6",
        strokeWidth: 2,
        dash: [5, 5],
      });
      group.add(line);

      // Preview line to cursor
      const previewLine = new Konva.Line({
        points: [
          points[points.length - 1].position.x,
          points[points.length - 1].position.y,
          cursorPos.x,
          cursorPos.y,
        ],
        stroke: "#94a3b8",
        strokeWidth: 1,
        dash: [3, 3],
      });
      group.add(previewLine);
    }

    return group;
  }

  /**
   * Render close zone indicator
   */
  renderCloseZone(startPoint: Point, radius: number): Konva.Circle {
    return new Konva.Circle({
      x: startPoint.x,
      y: startPoint.y,
      radius,
      stroke: "#10b981",
      strokeWidth: 2,
      dash: [5, 5],
      fill: "rgba(16, 185, 129, 0.1)",
    });
  }

  /**
   * Clear the layer
   */
  clear(): void {
    this.layer.destroyChildren();
  }

  /**
   * Redraw the layer
   */
  draw(): void {
    this.layer.batchDraw();
  }
}

// ============================================================================
// 5. CONTROLS RENDERER - Renders interactive editing controls
// ============================================================================

export class ControlsRenderer {
  constructor(private layer: Layer) {}

  /**
   * Render anchor points for editing
   */
  renderAnchorPoints(
    points: BezierPoint[],
    selectedIndices: Set<number>,
    onPointDrag: (index: number, pos: Point) => void
  ): Konva.Group {
    const group = new Konva.Group();

    points.forEach((point, index) => {
      const isSelected = selectedIndices.has(index);

      const circle = new Konva.Circle({
        x: point.position.x,
        y: point.position.y,
        radius: isSelected ? 8 : 6,
        fill: isSelected ? "#3b82f6" : "#ffffff",
        stroke: "#1e40af",
        strokeWidth: 2,
        draggable: true,
      });

      circle.on("dragmove", () => {
        const pos = circle.position();
        onPointDrag(index, pos);
      });

      group.add(circle);
    });

    return group;
  }

  /**
   * Render bezier handles for selected points
   */
  renderHandles(
    points: BezierPoint[],
    selectedIndices: Set<number>,
    onHandleDrag: (
      pointIndex: number,
      handleType: "in" | "out",
      offset: Point
    ) => void
  ): Konva.Group {
    const group = new Konva.Group();

    selectedIndices.forEach((index) => {
      const point = points[index];

      // Handle In
      if (point.handleIn) {
        const handleInPos = {
          x: point.position.x + point.handleIn.x,
          y: point.position.y + point.handleIn.y,
        };

        const line = new Konva.Line({
          points: [
            point.position.x,
            point.position.y,
            handleInPos.x,
            handleInPos.y,
          ],
          stroke: "#64748b",
          strokeWidth: 1,
        });
        group.add(line);

        const handle = new Konva.Circle({
          x: handleInPos.x,
          y: handleInPos.y,
          radius: 5,
          fill: "#ffffff",
          stroke: "#64748b",
          strokeWidth: 2,
          draggable: true,
        });

        handle.on("dragmove", () => {
          const pos = handle.position();
          const offset = {
            x: pos.x - point.position.x,
            y: pos.y - point.position.y,
          };
          onHandleDrag(index, "in", offset);
        });

        group.add(handle);
      }

      // Handle Out
      if (point.handleOut) {
        const handleOutPos = {
          x: point.position.x + point.handleOut.x,
          y: point.position.y + point.handleOut.y,
        };

        const line = new Konva.Line({
          points: [
            point.position.x,
            point.position.y,
            handleOutPos.x,
            handleOutPos.y,
          ],
          stroke: "#64748b",
          strokeWidth: 1,
        });
        group.add(line);

        const handle = new Konva.Circle({
          x: handleOutPos.x,
          y: handleOutPos.y,
          radius: 5,
          fill: "#ffffff",
          stroke: "#64748b",
          strokeWidth: 2,
          draggable: true,
        });

        handle.on("dragmove", () => {
          const pos = handle.position();
          const offset = {
            x: pos.x - point.position.x,
            y: pos.y - point.position.y,
          };
          onHandleDrag(index, "out", offset);
        });

        group.add(handle);
      }
    });

    return group;
  }

  /**
   * Clear the layer
   */
  clear(): void {
    this.layer.destroyChildren();
  }

  /**
   * Redraw the layer
   */
  draw(): void {
    this.layer.batchDraw();
  }
}

// ============================================================================
// 6. PERSISTENCE MANAGER - Syncs with VideoEditingProject
// ============================================================================

export class PersistenceManager {
  constructor(private project: VideoEditingProject) {}

  /**
   * Save a closed path
   */
  saveClosedPath(layerId: string, frameId: string, path: BezierPath): boolean {
    if (!path.closed || path.points.length < 3) return false;

    try {
      this.project.addPathToLayerFrame(layerId, frameId, path);
      return true;
    } catch (error) {
      console.error("Failed to save path:", error);
      return false;
    }
  }

  /**
   * Update an existing path
   */
  updatePath(
    layerId: string,
    frameId: string,
    pathId: string,
    updates: Partial<BezierPath>
  ): boolean {
    try {
      return this.project.updatePath(layerId, frameId, pathId, updates);
    } catch (error) {
      console.error("Failed to update path:", error);
      return false;
    }
  }

  /**
   * Delete a path
   */
  deletePath(layerId: string, frameId: string, pathId: string): boolean {
    try {
      return this.project.removePath(layerId, frameId, pathId);
    } catch (error) {
      console.error("Failed to delete path:", error);
      return false;
    }
  }

  /**
   * Get all paths for layer/frame
   */
  getPaths(layerId: string, frameId: string): BezierPath[] {
    return this.project.getLayerFrameMasks(layerId, frameId);
  }
}

// ============================================================================
// 7. PEN TOOL - Main coordinator class
// ============================================================================
// ============================================================================
// 7. PEN TOOL - Main coordinator class
// ============================================================================

export class PenTool {
  private drawer: PathDrawer;
  private editor: PathEditor;
  private pathRenderer: PathRenderer;
  private controlsRenderer: ControlsRenderer;
  private persistence: PersistenceManager;

  private state: PenToolState = {
    mode: "idle",
    activeLayerId: null,
    activeFrameId: null,
  };

  private stage: Stage;
  private pathsLayer: Layer;
  private drawingLayer: Layer;
  private controlsLayer: Layer;

  // Track mouse down position to detect drag
  private mouseDownPoint: Point | null = null;
  private isMouseDown = false;

  constructor(
    stage: Stage,
    project: VideoEditingProject,
    config: Partial<PenToolConfig> = {}
  ) {
    const fullConfig: PenToolConfig = {
      closeZoneRadius: 15,
      snapToAngle: true,
      snapToGrid: false,
      gridSize: 10,
      handleLength: 30,
      ...config,
    };

    this.stage = stage;
    this.drawer = new PathDrawer(fullConfig);
    this.editor = new PathEditor();
    this.persistence = new PersistenceManager(project);

    // Get or create layers
    this.pathsLayer =
      stage.findOne(".paths") || new Konva.Layer({ name: "paths" });
    this.drawingLayer =
      stage.findOne(".drawing") || new Konva.Layer({ name: "drawing" });
    this.controlsLayer =
      stage.findOne(".controls") || new Konva.Layer({ name: "controls" });

    if (!stage.findOne(".paths")) stage.add(this.pathsLayer);
    if (!stage.findOne(".drawing")) stage.add(this.drawingLayer);
    if (!stage.findOne(".controls")) stage.add(this.controlsLayer);

    this.pathRenderer = new PathRenderer(this.pathsLayer);
    this.controlsRenderer = new ControlsRenderer(this.controlsLayer);

    this.setupEventHandlers();
  }

  /**
   * Set active layer and frame
   */
  setActiveContext(layerId: string, frameId: string): void {
    this.state.activeLayerId = layerId;
    this.state.activeFrameId = frameId;
    this.renderPaths();
  }

  /**
   * Handle mouse down on canvas
   */
  private handleCanvasMouseDown(point: Point): void {
    if (this.state.mode === "idle") {
      this.startDrawing(point);
      // this.mouseDownPoint = point;
      // this.isMouseDown = true;
    } else if (this.state.mode === "drawing") {
      if (this.drawer.isInCloseZone(point)) {
        // Don't start drag if closing
        return;
      }
      this.mouseDownPoint = point;
      this.isMouseDown = true;
      this.drawer.startDrag(point);
    }
  }

  /**
   * Handle mouse move
   */
  private handleCanvasMouseMove(point: Point): void {
    console.log(this.drawer.getPoints())
    if (this.state.mode === "drawing") {
      // If dragging, update the drag
      if (this.isMouseDown && this.mouseDownPoint) {
        this.drawer.updateDrag(point);
      }
      this.renderDrawing();
    }
  }

  /**
   * Handle mouse up on canvas
   */
  private handleCanvasMouseUp(point: Point): void {
    if (
      this.state.mode === "drawing" &&
      this.isMouseDown &&
      this.mouseDownPoint
    ) {
      // Check if this was a drag or just a click
      const dragDistance = GeometryHelper.distance(this.mouseDownPoint, point);
      const isDrag = dragDistance > 3; // Threshold to distinguish click from drag

      if (this.drawer.isInCloseZone(point)) {
        // Close the path
        this.closePath();
      } else if (isDrag) {
        // End the drag - this finalizes the smooth point
        this.drawer.endDrag(point);
        this.renderDrawing();
      } else {
        // Simple click - add corner point
        this.drawer.addCornerPoint(point);
        this.renderDrawing();
      }
    }

    this.mouseDownPoint = null;
    this.isMouseDown = false;
  }

  /**
   * Start drawing a new path
   */
  private startDrawing(point: Point): void {
    this.drawer.startPath(point);
    this.state.mode = "drawing";
    this.renderDrawing();
  }

  /**
   * Close and save the current path
   */
  private closePath(): void {
    const path = this.drawer.closePath();
    if (path && this.state.activeLayerId && this.state.activeFrameId) {
      this.persistence.saveClosedPath(
        this.state.activeLayerId,
        this.state.activeFrameId,
        path
      );
      this.state.mode = "idle";
      this.renderPaths();
      this.drawingLayer.destroyChildren();
      this.drawingLayer.batchDraw();
    }
  }

  /**
   * Cancel current drawing
   */
  cancelDrawing(): void {
    this.drawer.cancel();
    this.state.mode = "idle";
    this.mouseDownPoint = null;
    this.isMouseDown = false;
    this.drawingLayer.destroyChildren();
    this.drawingLayer.batchDraw();
  }

  /**
   * Render all completed paths
   */
  private renderPaths(): void {
    if (!this.state.activeLayerId || !this.state.activeFrameId) return;

    this.pathRenderer.clear();

    const paths = this.persistence.getPaths(
      this.state.activeLayerId,
      this.state.activeFrameId
    );

    paths.forEach((path) => {
      const isSelected = this.editor.getSelectedPath()?.id === path.id;
      const shape = this.pathRenderer.renderClosedPath(path, isSelected);

      shape.on("click", () => this.selectPath(path));

      this.pathsLayer.add(shape);
    });

    this.pathRenderer.draw();
  }

  /**
   * Render drawing preview
   */
  private renderDrawing(): void {
    this.drawingLayer.destroyChildren();

    const points = this.drawer.getPoints();
    const cursorPos = this.stage.getPointerPosition() || { x: 0, y: 0 };

    const preview = this.pathRenderer.renderDrawingPreview(points, cursorPos);
    this.drawingLayer.add(preview);

    if (this.drawer.canClose() && this.drawer.isInCloseZone(cursorPos)) {
      const closeZone = this.pathRenderer.renderCloseZone(
        points[0].position,
        15
      );
      this.drawingLayer.add(closeZone);
    }

    this.drawingLayer.batchDraw();
  }

  /**
   * Select a path for editing
   */
  private selectPath(path: BezierPath): void {
    this.editor.selectPath(path);
    this.state.mode = "editing";
    this.renderControls();
  }

  /**
   * Render editing controls
   */
  private renderControls(): void {
    this.controlsRenderer.clear();

    const path = this.editor.getSelectedPath();
    if (!path) return;

    const anchorPoints = this.controlsRenderer.renderAnchorPoints(
      path.points,
      this.editor.getSelectedPointIndices(),
      (index, pos) => {
        this.editor.movePoint(index, pos);
        this.updatePathInProject();
      }
    );

    const handles = this.controlsRenderer.renderHandles(
      path.points,
      this.editor.getSelectedPointIndices(),
      (index, handleType, offset) => {
        this.editor.updateHandle(index, handleType, offset);
        this.updatePathInProject();
      }
    );

    this.controlsLayer.add(anchorPoints);
    this.controlsLayer.add(handles);
    this.controlsRenderer.draw();
  }

  /**
   * Update path in project after editing
   */
  private updatePathInProject(): void {
    const path = this.editor.getSelectedPath();
    if (!path || !this.state.activeLayerId || !this.state.activeFrameId) return;

    this.persistence.updatePath(
      this.state.activeLayerId,
      this.state.activeFrameId,
      path.id,
      { points: path.points }
    );

    this.renderPaths();
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.stage.on("mousedown", (e) => {
      if (e.target === this.stage) {
        const pos = this.stage.getPointerPosition();
        if (pos) this.handleCanvasMouseDown(pos);
      }
    });

    this.stage.on("mousemove", (e) => {
      const pos = this.stage.getPointerPosition();
      if (pos) this.handleCanvasMouseMove(pos);
    });

    this.stage.on("mouseup", (e) => {
      if (e.target === this.stage) {
        const pos = this.stage.getPointerPosition();
        if (pos) this.handleCanvasMouseUp(pos);
      }
    });
  }

  /**
   * Get current mode
   */
  getMode(): PenToolMode {
    return this.state.mode;
  }
}
