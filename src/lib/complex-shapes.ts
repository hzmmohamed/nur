import Konva from "konva";

/**
 * Bezier Path Classes for Konva.js
 *
 * A set of wrapper classes for building vector drawing tools with cubic Bezier curves,
 * similar to Figma/Photoshop pen tools.
 *
 * Classes:
 * - BezierPointHandle: Control handle (circle + line) for adjusting curve shape
 * - BezierPoint: Anchor point with two handles (handle-in, handle-out)
 * - BezierPath: Complete Bezier curve composed of multiple points
 * - BezierLayer: Custom Konva.Layer that auto-initializes Bezier classes
 *
 * Key Features:
 * - Automatic path updates when points/handles move (via callbacks)
 * - Constant visual size regardless of zoom (requires stage.fire('scaleChange'))
 * - Interactive states: normal, hovered, selected
 * - Flexible handle visibility modes: always, selected, hidden
 * - Dynamic point addition with auto-initialization
 * - Hover highlights both handle circle and line; drag only from circle
 * - Larger hit areas for easier interaction
 *
 * Usage:
 *   const layer = new BezierLayer();
 *   const path = new BezierPath([...points], false, '#000', 2);
 *   layer.add(path); // Auto-initializes scale handling
 *
 *   // When zooming:
 *   stage.scale({ x: scale, y: scale });
 *   stage.fire('scaleChange'); // Required for constant visual size
 *   layer.batchDraw();
 */

// Type definitions
type VisualState = "normal" | "hovered" | "selected";
type HandleType = "handle-in" | "handle-out";
type PointType = "smooth" | "mirrored" | "disconnected" | "corner";
type HandleVisibilityMode = "always" | "selected" | "hidden";

interface Position {
  x: number;
  y: number;
}

interface HandleData {
  angle: number; // In radians
  distance: number;
}

interface ChangeCallback {
  (): void;
}

// ============================================================================
// BezierPointHandle Class
// ============================================================================
class BezierPointHandle {
  private group: Konva.Group;
  private line: Konva.Line;
  private circle: Konva.Circle;
  private _angle: number; // In radians
  private _distance: number;
  private _anchorPosition: Position;
  private _state: VisualState = "normal";
  private _type: HandleType;
  private _canHover: boolean = true;
  private _canSelect: boolean = true;
  private onChange?: ChangeCallback;

  constructor(
    type: HandleType,
    angle: number,
    distance: number,
    anchorPosition: Position,
    onChange?: ChangeCallback
  ) {
    this._type = type;
    this._angle = angle;
    this._distance = distance;
    this._anchorPosition = { ...anchorPosition };
    this.onChange = onChange;

    this.group = new Konva.Group();

    const position = this.polarToCartesian();

    // Create line from anchor to handle
    this.line = new Konva.Line({
      points: [anchorPosition.x, anchorPosition.y, position.x, position.y],
      stroke: "#666",
      strokeWidth: 1,
      listening: true,
      hitStrokeWidth: 10, // Larger hitbox for easier hovering
    });

    // Create handle point
    this.circle = new Konva.Circle({
      x: position.x,
      y: position.y,
      radius: 5,
      fill: "#fff",
      stroke: "#666",
      strokeWidth: 2,
      draggable: true,
    });

    this.group.add(this.line);
    this.group.add(this.circle);

    this.setupEventHandlers();
    this.updateVisualState();
  }

  private polarToCartesian(): Position {
    return {
      x: this._anchorPosition.x + Math.cos(this._angle) * this._distance,
      y: this._anchorPosition.y + Math.sin(this._angle) * this._distance,
    };
  }

  private cartesianToPolar(position: Position): {
    angle: number;
    distance: number;
  } {
    const dx = position.x - this._anchorPosition.x;
    const dy = position.y - this._anchorPosition.y;
    return {
      angle: Math.atan2(dy, dx),
      distance: Math.sqrt(dx * dx + dy * dy),
    };
  }

  private setupEventHandlers(): void {
    // Hover on line - highlights both line and circle
    this.line.on("mouseenter", () => {
      if (this._canHover) {
        this.setState("hovered");
      }
    });

    this.line.on("mouseleave", () => {
      if (this._canHover && this._state === "hovered") {
        this.setState("normal");
      }
    });

    // Hover on circle - highlights both line and circle
    this.circle.on("mouseenter", () => {
      if (this._canHover) {
        this.setState("hovered");
      }
    });

    this.circle.on("mouseleave", () => {
      if (this._canHover && this._state === "hovered") {
        this.setState("normal");
      }
    });

    // Drag only works on circle
    this.circle.on("dragmove", () => {
      const pos = this.circle.position();
      const polar = this.cartesianToPolar(pos);
      this._angle = polar.angle;
      this._distance = polar.distance;
      this.updateLinePosition();
      if (this.onChange) {
        this.onChange();
      }
    });
  }

  private updateVisualState(): void {
    let circleStroke = "#666";
    let circleFill = "#fff";
    let lineStroke = "#666";

    switch (this._state) {
      case "hovered":
        circleStroke = "#0066ff";
        lineStroke = "#0066ff";
        break;
      case "selected":
        circleStroke = "#0066ff";
        circleFill = "#0066ff";
        lineStroke = "#0066ff";
        break;
    }

    this.circle.stroke(circleStroke);
    this.circle.fill(circleFill);
    this.line.stroke(lineStroke);
  }

  private updateLinePosition(): void {
    const position = this.polarToCartesian();
    const points = this.line.points();
    this.line.points([points[0], points[1], position.x, position.y]);
    this.circle.position(position);
  }

  public updateAnchorPosition(anchorPosition: Position): void {
    this._anchorPosition = { ...anchorPosition };
    const position = this.polarToCartesian();
    const points = this.line.points();
    this.line.points([
      anchorPosition.x,
      anchorPosition.y,
      position.x,
      position.y,
    ]);
    this.circle.position(position);
  }

  public setAngle(angle: number): void {
    this._angle = angle;
    this.updateLinePosition();
  }

  public setDistance(distance: number): void {
    this._distance = distance;
    this.updateLinePosition();
  }

  public setAngleAndDistance(angle: number, distance: number): void {
    this._angle = angle;
    this._distance = distance;
    this.updateLinePosition();
  }

  public getAngle(): number {
    return this._angle;
  }

  public getDistance(): number {
    return this._distance;
  }

  public getPosition(): Position {
    return this.polarToCartesian();
  }

  public getType(): HandleType {
    return this._type;
  }

  public setState(state: VisualState): void {
    this._state = state;
    this.updateVisualState();
  }

  public getState(): VisualState {
    return this._state;
  }

  public show(): void {
    this.group.show();
  }

  public hide(): void {
    this.group.hide();
  }

  public enableHover(enable: boolean = true): void {
    this._canHover = enable;
    if (!enable && this._state === "hovered") {
      this.setState("normal");
    }
  }

  public enableSelect(enable: boolean = true): void {
    this._canSelect = enable;
    if (!enable && this._state === "selected") {
      this.setState("normal");
    }
  }

  public getGroup(): Konva.Group {
    return this.group;
  }

  public updateScale(inverseScale: number): void {
    // Scale the individual shapes, not the group
    this.circle.scaleX(inverseScale);
    this.circle.scaleY(inverseScale);
    this.line.strokeWidth(1 * inverseScale);
  }

  public destroy(): void {
    this.group.destroy();
  }
}

// ============================================================================
// BezierPoint Class
// ============================================================================
class BezierPoint {
  private group: Konva.Group;
  private anchorCircle: Konva.Circle;
  private _position: Position;
  private _handleIn?: BezierPointHandle;
  private _handleOut?: BezierPointHandle;
  private _pointType: PointType = "smooth";
  private _state: VisualState = "normal";
  private _handleVisibilityMode: HandleVisibilityMode = "selected";
  private _canHover: boolean = true;
  private _canSelect: boolean = true;
  private _showHandles: boolean;
  private onChange?: ChangeCallback;
  private scaleHandler?: () => void;

  constructor(
    position: Position,
    handleInAngle: number = Math.PI, // Default: pointing left
    handleInDistance: number = 50,
    handleOutAngle: number = 0, // Default: pointing right
    handleOutDistance: number = 50,
    showHandles: boolean = true,
    onChange?: ChangeCallback
  ) {
    this._position = { ...position };
    this._showHandles = showHandles;
    this.onChange = onChange;

    this.group = new Konva.Group();

    // Create anchor point
    this.anchorCircle = new Konva.Circle({
      x: position.x,
      y: position.y,
      radius: 6,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 2,
      draggable: true,
      hitStrokeWidth: 10, // Larger hit area for easier dragging
    });

    // Create handles if needed (add them first so anchor renders on top)
    if (showHandles) {
      this._handleIn = new BezierPointHandle(
        "handle-in",
        handleInAngle,
        handleInDistance,
        position,
        () => this.onHandleChange("handle-in")
      );

      this._handleOut = new BezierPointHandle(
        "handle-out",
        handleOutAngle,
        handleOutDistance,
        position,
        () => this.onHandleChange("handle-out")
      );

      this.group.add(this._handleIn.getGroup());
      this.group.add(this._handleOut.getGroup());

      this.updateHandleVisibility();
    }

    // Add anchor circle last so it renders on top
    this.group.add(this.anchorCircle);

    this.setupEventHandlers();
    this.setupScaleListener();
    this.updateVisualState();
  }

  private setupScaleListener(): void {
    this.scaleHandler = () => {
      const stage = this.group.getStage();
      if (stage) {
        const scale = stage.scaleX();
        const inverseScale = 1 / scale;

        // Scale individual shapes, not the group
        this.anchorCircle.scaleX(inverseScale);
        this.anchorCircle.scaleY(inverseScale);

        // Scale the handles
        if (this._handleIn) {
          this._handleIn.updateScale(inverseScale);
        }

        if (this._handleOut) {
          this._handleOut.updateScale(inverseScale);
        }

        const layer = this.group.getLayer();
        if (layer) {
          layer.batchDraw();
        }
      }
    };
  }

  public initialize(): void {
    const stage = this.group.getStage();
    if (stage && this.scaleHandler) {
      stage.on("scaleChange", this.scaleHandler);
      this.scaleHandler(); // Apply initial scale
    }

    // Don't initialize child handles - they're part of the same scaled group
  }

  private setupEventHandlers(): void {
    this.anchorCircle.on("mouseenter", () => {
      if (this._canHover) {
        this.setState("hovered");
      }
    });

    this.anchorCircle.on("mouseleave", () => {
      if (this._canHover && this._state === "hovered") {
        this.setState("normal");
      }
    });

    this.anchorCircle.on("dragmove", () => {
      const pos = this.anchorCircle.position();
      const dx = pos.x - this._position.x;
      const dy = pos.y - this._position.y;

      this._position = { x: pos.x, y: pos.y };

      // Update handle anchor positions (they maintain their angle and distance)
      if (this._handleIn) {
        this._handleIn.updateAnchorPosition(this._position);
      }

      if (this._handleOut) {
        this._handleOut.updateAnchorPosition(this._position);
      }

      if (this.onChange) {
        this.onChange();
      }
    });
  }

  private onHandleChange(handleType: HandleType): void {
    // When one handle is dragged, update the sibling handle's angle symmetrically
    if (this._pointType === "smooth" || this._pointType === "mirrored") {
      if (handleType === "handle-in" && this._handleIn && this._handleOut) {
        const inAngle = this._handleIn.getAngle();
        // Opposite angle is 180 degrees (π radians) away
        this._handleOut.setAngle(inAngle + Math.PI);
      } else if (
        handleType === "handle-out" &&
        this._handleIn &&
        this._handleOut
      ) {
        const outAngle = this._handleOut.getAngle();
        // Opposite angle is 180 degrees (π radians) away
        this._handleIn.setAngle(outAngle + Math.PI);
      }

      // For mirrored type, also match the distance
      if (this._pointType === "mirrored") {
        if (handleType === "handle-in" && this._handleIn && this._handleOut) {
          this._handleOut.setDistance(this._handleIn.getDistance());
        } else if (
          handleType === "handle-out" &&
          this._handleIn &&
          this._handleOut
        ) {
          this._handleIn.setDistance(this._handleOut.getDistance());
        }
      }
    }

    if (this.onChange) {
      this.onChange();
    }
  }

  private updateVisualState(): void {
    let stroke = "#000";
    let fill = "#fff";

    switch (this._state) {
      case "hovered":
        stroke = "#0066ff";
        break;
      case "selected":
        stroke = "#0066ff";
        fill = "#0066ff";
        break;
    }

    this.anchorCircle.stroke(stroke);
    this.anchorCircle.fill(fill);
    this.updateHandleVisibility();
  }

  private updateHandleVisibility(): void {
    if (!this._handleIn || !this._handleOut) return;

    switch (this._handleVisibilityMode) {
      case "always":
        this._handleIn.show();
        this._handleOut.show();
        break;
      case "selected":
        if (this._state === "selected") {
          this._handleIn.show();
          this._handleOut.show();
        } else {
          this._handleIn.hide();
          this._handleOut.hide();
        }
        break;
      case "hidden":
        this._handleIn.hide();
        this._handleOut.hide();
        break;
    }
  }

  public updatePosition(position: Position): void {
    this._position = { ...position };
    this.anchorCircle.position(position);

    // Update handle anchor positions (they maintain their angle and distance)
    if (this._handleIn) {
      this._handleIn.updateAnchorPosition(this._position);
    }

    if (this._handleOut) {
      this._handleOut.updateAnchorPosition(this._position);
    }
  }

  public getPosition(): Position {
    return { ...this._position };
  }

  public getHandleInPosition(): Position | null {
    return this._handleIn ? this._handleIn.getPosition() : null;
  }

  public getHandleOutPosition(): Position | null {
    return this._handleOut ? this._handleOut.getPosition() : null;
  }

  public setState(state: VisualState): void {
    this._state = state;
    this.updateVisualState();
  }

  public getState(): VisualState {
    return this._state;
  }

  public showHandles(show: boolean = true): void {
    if (this._handleIn) {
      show ? this._handleIn.show() : this._handleIn.hide();
    }
    if (this._handleOut) {
      show ? this._handleOut.show() : this._handleOut.hide();
    }
  }

  public hideHandles(): void {
    this.showHandles(false);
  }

  public setHandleVisibilityMode(mode: HandleVisibilityMode): void {
    this._handleVisibilityMode = mode;
    this.updateHandleVisibility();
  }

  public setPointType(type: PointType): void {
    this._pointType = type;
  }

  public getPointType(): PointType {
    return this._pointType;
  }

  public enableHover(enable: boolean = true): void {
    this._canHover = enable;
    if (!enable && this._state === "hovered") {
      this.setState("normal");
    }
  }

  public enableSelect(enable: boolean = true): void {
    this._canSelect = enable;
    if (!enable && this._state === "selected") {
      this.setState("normal");
    }
  }

  public getGroup(): Konva.Group {
    return this.group;
  }

  public destroy(): void {
    const stage = this.group.getStage();
    if (stage && this.scaleHandler) {
      stage.off("scaleChange", this.scaleHandler);
    }
    this._handleIn?.destroy();
    this._handleOut?.destroy();
    this.group.destroy();
  }
}

// ============================================================================
// BezierPath Class
// ============================================================================
class BezierPath {
  private group: Konva.Group;
  private path: Konva.Line;
  private _points: BezierPoint[] = [];
  private _closed: boolean = false;
  private _state: VisualState = "normal";
  private _canHover: boolean = true;
  private _canSelect: boolean = true;
  private scaleHandler?: () => void;
  private baseStrokeWidth: number;
  private _handleVisibilityMode: HandleVisibilityMode = "selected";

  constructor(
    points: Array<{
      position: Position;
      handleInAngle?: number;
      handleInDistance?: number;
      handleOutAngle?: number;
      handleOutDistance?: number;
    }> = [],
    closed: boolean = false,
    stroke: string = "#000",
    strokeWidth: number = 2,
    fill?: string
  ) {
    this._closed = closed;
    this.baseStrokeWidth = strokeWidth;
    this.group = new Konva.Group();

    // Create the path
    this.path = new Konva.Line({
      points: [],
      stroke,
      strokeWidth,
      fill: fill || "",
      closed,
      bezier: true,
      listening: true,
    });

    this.group.add(this.path);

    // Add initial points
    points.forEach((pointData) => {
      this.addPoint(
        pointData.position,
        pointData.handleInAngle,
        pointData.handleInDistance,
        pointData.handleOutAngle,
        pointData.handleOutDistance
      );
    });

    this.setupEventHandlers();
    this.setupScaleListener();
    this.updatePath();
  }

  private setupScaleListener(): void {
    this.scaleHandler = () => {
      const stage = this.group.getStage();
      if (stage) {
        const scale = stage.scaleX();
        const inverseScale = 1 / scale;

        // Scale the path stroke width to maintain consistent thickness
        this.path.strokeWidth(this.baseStrokeWidth * inverseScale);

        const layer = this.group.getLayer();
        if (layer) {
          layer.batchDraw();
        }
      }
    };
  }

  public initialize(): void {
    const stage = this.group.getStage();
    if (stage && this.scaleHandler) {
      stage.on("scaleChange", this.scaleHandler);
      this.scaleHandler(); // Apply initial scale to stroke width
    }

    // Initialize all child points
    this._points.forEach((point) => point.initialize());
  }

  private setupEventHandlers(): void {
    this.path.on("mouseenter", () => {
      if (this._canHover) {
        this.setState("hovered");
      }
    });

    this.path.on("mouseleave", () => {
      if (this._canHover && this._state === "hovered") {
        this.setState("normal");
      }
    });
  }

  private onPointChange(): void {
    this.updatePath();
  }

  private updatePath(): void {
    const pathData: number[] = [];

    this._points.forEach((point, index) => {
      const pos = point.getPosition();
      const handleOut = point.getHandleOutPosition();
      const nextPoint =
        this._points[index + 1] || (this._closed ? this._points[0] : null);
      const handleIn = nextPoint?.getHandleInPosition();

      if (index === 0) {
        // Move to first point
        pathData.push(pos.x, pos.y);
      }

      if (nextPoint) {
        // Add cubic bezier curve to next point
        const nextPos = nextPoint.getPosition();

        if (handleOut && handleIn) {
          // Use handle positions for cubic bezier
          pathData.push(handleOut.x, handleOut.y);
          pathData.push(handleIn.x, handleIn.y);
          pathData.push(nextPos.x, nextPos.y);
        } else {
          // Fallback to simple line
          pathData.push(nextPos.x, nextPos.y);
        }
      }
    });

    this.path.points(pathData);
  }

  public addPoint(
    position: Position,
    handleInAngle?: number,
    handleInDistance?: number,
    handleOutAngle?: number,
    handleOutDistance?: number
  ): BezierPoint {
    const point = new BezierPoint(
      position,
      handleInAngle,
      handleInDistance,
      handleOutAngle,
      handleOutDistance,
      true,
      () => this.onPointChange()
    );

    // Apply path's handle visibility mode to new point
    point.setHandleVisibilityMode(this._handleVisibilityMode);

    this._points.push(point);
    this.group.add(point.getGroup());

    // Initialize the point if the path is already on stage
    const stage = this.group.getStage();
    if (stage) {
      point.initialize();
    }

    this.updatePath();

    return point;
  }

  public insertPoint(
    index: number,
    position: Position,
    handleInAngle?: number,
    handleInDistance?: number,
    handleOutAngle?: number,
    handleOutDistance?: number
  ): BezierPoint {
    const point = new BezierPoint(
      position,
      handleInAngle,
      handleInDistance,
      handleOutAngle,
      handleOutDistance,
      true,
      () => this.onPointChange()
    );

    // Apply path's handle visibility mode to new point
    point.setHandleVisibilityMode(this._handleVisibilityMode);

    this._points.splice(index, 0, point);
    this.group.add(point.getGroup());

    // Initialize the point if the path is already on stage
    const stage = this.group.getStage();
    if (stage) {
      point.initialize();
    }

    this.updatePath();

    return point;
  }

  public removePoint(index: number): void {
    if (index >= 0 && index < this._points.length) {
      const point = this._points[index];
      point.destroy();
      this._points.splice(index, 1);
      this.updatePath();
    }
  }

  public getPoints(): BezierPoint[] {
    return [...this._points];
  }

  public selectPoint(index: number): void {
    if (index >= 0 && index < this._points.length) {
      this._points[index].setState("selected");
    }
  }

  public deselectPoint(index: number): void {
    if (index >= 0 && index < this._points.length) {
      this._points[index].setState("normal");
    }
  }

  public deselectAllPoints(): void {
    this._points.forEach((point) => point.setState("normal"));
  }

  public setState(state: VisualState): void {
    this._state = state;
    // Could update path appearance based on state if needed
  }

  public getState(): VisualState {
    return this._state;
  }

  public enableHover(enable: boolean = true): void {
    this._canHover = enable;
    if (!enable && this._state === "hovered") {
      this.setState("normal");
    }
    this._points.forEach((point) => point.enableHover(enable));
  }

  public enableSelect(enable: boolean = true): void {
    this._canSelect = enable;
    if (!enable && this._state === "selected") {
      this.setState("normal");
    }
    this._points.forEach((point) => point.enableSelect(enable));
  }

  public showAllHandles(show: boolean = true): void {
    this._points.forEach((point) => point.showHandles(show));
  }

  public hideAllHandles(): void {
    this.showAllHandles(false);
  }

  public setHandleVisibilityMode(mode: HandleVisibilityMode): void {
    this._handleVisibilityMode = mode;
    this._points.forEach((point) => point.setHandleVisibilityMode(mode));
  }

  public getHandleVisibilityMode(): HandleVisibilityMode {
    return this._handleVisibilityMode;
  }

  public setClosed(closed: boolean): void {
    this._closed = closed;
    this.path.closed(closed);
    this.updatePath();
  }

  public isClosed(): boolean {
    return this._closed;
  }

  public toSVGPath(): string {
    let svgPath = "";

    this._points.forEach((point, index) => {
      const pos = point.getPosition();
      const handleOut = point.getHandleOutPosition();
      const nextPoint =
        this._points[index + 1] || (this._closed ? this._points[0] : null);
      const handleIn = nextPoint?.getHandleInPosition();

      if (index === 0) {
        svgPath += `M ${pos.x} ${pos.y} `;
      }

      if (nextPoint) {
        const nextPos = nextPoint.getPosition();

        if (handleOut && handleIn) {
          svgPath += `C ${handleOut.x} ${handleOut.y}, ${handleIn.x} ${handleIn.y}, ${nextPos.x} ${nextPos.y} `;
        } else {
          svgPath += `L ${nextPos.x} ${nextPos.y} `;
        }
      }
    });

    if (this._closed) {
      svgPath += "Z";
    }

    return svgPath.trim();
  }

  public getGroup(): Konva.Group {
    return this.group;
  }

  public destroy(): void {
    const stage = this.group.getStage();
    if (stage && this.scaleHandler) {
      stage.off("scaleChange", this.scaleHandler);
    }
    this._points.forEach((point) => point.destroy());
    this.group.destroy();
  }
}

// ============================================================================
// BezierLayer Class
// ============================================================================
class BezierLayer extends Konva.Layer {
  public add(
    ...children: (Konva.Node | BezierPath | BezierPoint | BezierPointHandle)[]
  ): this {
    children.forEach((child) => {
      if (
        child instanceof BezierPath ||
        child instanceof BezierPoint ||
        child instanceof BezierPointHandle
      ) {
        super.add(child.getGroup());
        child.initialize();
      } else {
        super.add(child);
      }
    });

    return this;
  }
}

// Export classes
export { BezierPointHandle, BezierPoint, BezierPath, BezierLayer };
export type {
  VisualState,
  HandleType,
  PointType,
  HandleVisibilityMode,
  Position,
};

// ============================================================================
// Example Usage
// ============================================================================
/*
// Create a Konva stage and BezierLayer
const stage = new Konva.Stage({
  container: 'container', // id of container div
  width: 800,
  height: 600,
});

const layer = new BezierLayer(); // Use BezierLayer instead of regular Layer
stage.add(layer);

// Helper function to zoom and notify shapes
const setStageScale = (scale: number) => {
  stage.scale({ x: scale, y: scale });
  stage.fire('scaleChange'); // Fire custom event to update shape scales
  layer.batchDraw();
};

// Example 1: Create a simple bezier path with 3 points
const path1 = new BezierPath(
  [
    {
      position: { x: 100, y: 300 },
      handleInAngle: Math.PI,      // pointing left
      handleInDistance: 50,
      handleOutAngle: 0,            // pointing right
      handleOutDistance: 50,
    },
    {
      position: { x: 300, y: 150 },
      handleInAngle: Math.PI * 0.75,  // pointing up-left
      handleInDistance: 70,
      handleOutAngle: Math.PI * -0.25, // pointing down-right
      handleOutDistance: 70,
    },
    {
      position: { x: 500, y: 300 },
      handleInAngle: Math.PI,      // pointing left
      handleInDistance: 50,
      handleOutAngle: 0,            // pointing right
      handleOutDistance: 50,
    },
  ],
  false, // not closed
  '#000', // stroke color
  2 // stroke width
);

// Add the path directly to the layer (no need to call getGroup() or initialize())
layer.add(path1);

// Example 2: Create a closed path (like a shape)
const path2 = new BezierPath(
  [
    {
      position: { x: 600, y: 200 },
      handleInAngle: Math.PI * 1.25,
      handleInDistance: 42,
      handleOutAngle: Math.PI * 0.25,
      handleOutDistance: 42,
    },
    {
      position: { x: 700, y: 250 },
      handleInAngle: Math.PI * 0.75,
      handleInDistance: 42,
      handleOutAngle: Math.PI * -0.25,
      handleOutDistance: 42,
    },
    {
      position: { x: 650, y: 350 },
      handleInAngle: 0,
      handleInDistance: 30,
      handleOutAngle: Math.PI,
      handleOutDistance: 30,
    },
  ],
  true, // closed
  '#0066ff', // stroke color
  2, // stroke width
  'rgba(0, 102, 255, 0.1)' // fill color
);

layer.add(path2);

// Example 3: Dynamically add points to a path
const path3 = new BezierPath([], false, '#ff6600', 2);
layer.add(path3);

path3.addPoint({ x: 100, y: 450 });
path3.addPoint({ x: 200, y: 400 }, Math.PI * 1.1, 50, Math.PI * -0.3, 50);
path3.addPoint({ x: 300, y: 500 }, Math.PI * 0.8, 50, Math.PI * -0.2, 50);Out: { x: 30, y: 30 },
    },
    {
      position: { x: 700, y: 250 },
      handleIn: { x: -30, y: 30 },
      handleOut: { x: 30, y: -30 },
    },
    {
      position: { x: 650, y: 350 },
      handleIn: { x: 30, y: 0 },
      handleOut: { x: -30, y: 0 },
    },
  ],
  true, // closed
  '#0066ff', // stroke color
  2, // stroke width
  'rgba(0, 102, 255, 0.1)' // fill color
);

layer.add(path2);

// Example 3: Dynamically add points to a path
const path3 = new BezierPath([], false, '#ff6600', 2);
layer.add(path3);

path3.addPoint({ x: 100, y: 450 });
path3.addPoint({ x: 200, y: 400 }, { x: -40, y: 20 }, { x: 40, y: -20 });
path3.addPoint({ x: 300, y: 500 }, { x: -40, y: -20 }, { x: 40, y: 20 });

// Example 4: Interact with points
// Select a point (shows handles if visibility mode is 'selected')
path1.selectPoint(1);

// Hide all handles
path2.hideAllHandles();

// Show handles for specific point
const points = path1.getPoints();
if (points.length > 0) {
  points[0].setHandleVisibilityMode('always');
}

// Example 5: Get SVG path data
console.log('Path 1 SVG:', path1.toSVGPath());

// Example 6: Zoom the stage (shapes will maintain constant size)
setStageScale(2); // Zoom to 2x

// Example 7: Remove a point
// path3.removePoint(1);

// Example 8: Insert a point at specific index
// path1.insertPoint(1, { x: 200, y: 225 }, { x: -30, y: 0 }, { x: 30, y: 0 });

// Draw the layer
layer.draw();
*/
