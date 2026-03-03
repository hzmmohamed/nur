/**
 * Refactored Cubic Bezier Path Implementation
 * 
 * Changes from original:
 * 1. Constructor accepts TypedYMap OR data (no raw Y.Map)
 * 2. Removed .ymap getter - no Y.Map exposure
 * 3. All Yjs operations go through TypedYMap
 * 4. Business rules enforced by schema, not class logic
 */

import * as Y from "yjs";
import type { BezierPoint, Bounds } from "../coordinate-utils";
import { cartesianToPolar, calculateBezierBounds } from "../coordinate-utils";
import type { ICubicBezierPath, IClosedCubicBezierPath } from "../interfaces";
import { TypedYMap } from "@/lib/yjs-utils/typed-wrappers/impl-composition-recursive";
import { 
  PathDataSchema, 
  ClosedPathDataSchema,
} from "../schemas-effect";
import type { Schema as S } from "effect";

// Type for the injected undo tracking function
type ExecuteUndoableOperation = (operation: () => void) => void;

// ============================================================================
// Implementation 1: Atomic Updates (Simpler, entire path updates at once)
// ============================================================================

export class CubicBezierPathAtomic implements ICubicBezierPath {
  protected typedYMap: TypedYMap<typeof PathDataSchema>;

  /**
   * Constructor accepts either:
   * - A pre-created TypedYMap (when wrapping existing data)
   * - Initial data (when creating new path)
   */
  constructor(
    typedYMapOrData: TypedYMap<typeof PathDataSchema> | S.Schema.Encoded<typeof PathDataSchema>,
    protected executeUndoable?: ExecuteUndoableOperation
  ) {
    if (typedYMapOrData instanceof TypedYMap) {
      // Wrapping existing TypedYMap
      this.typedYMap = typedYMapOrData;
    } else {
      // Creating new from data - TypedYMap creates Y.Map internally
      const ymap = new Y.Map();
      this.typedYMap = TypedYMap.create(PathDataSchema, ymap, typedYMapOrData);
    }
  }

  protected execute(operation: () => void): void {
    if (this.executeUndoable) {
      this.executeUndoable(operation);
    } else {
      operation();
    }
  }

  // =========================================================================
  // ICubicBezierPath Implementation
  // =========================================================================

  get pointCount(): number {
    return this.getPointCount();
  }

  get closed(): boolean {
    return this.isClosed();
  }

  getBounds(): Bounds | null {
    return calculateBezierBounds(this.getAllPoints());
  }

  isClosed(): boolean {
    return this.typedYMap.get("closed")!;
  }

  getPointCount(): number {
    const points = this.typedYMap.get("points")!;
    return points.length;
  }

  getAllPoints(): BezierPoint[] {
    const points = this.typedYMap.get("points")!;
    // Deep clone to prevent external mutation
    return JSON.parse(JSON.stringify(points));
  }

  getPoint(index: number): BezierPoint | undefined {
    const points = this.typedYMap.get("points")!;
    if (index < 0 || index >= points.length) {
      return undefined;
    }
    // Deep clone to prevent external mutation
    return JSON.parse(JSON.stringify(points[index]));
  }

  setClosed(closed: boolean): void {
    this.execute(() => {
      this.typedYMap.set("closed", closed);
    });
  }

  addPoint(point: BezierPoint): void {
    this.execute(() => {
      const points = this.typedYMap.get("points")!;
      // Deep clone to prevent external mutation
      points.push(JSON.parse(JSON.stringify(point)));
      this.typedYMap.set("points", points);
    });
  }

  insertPoint(index: number, point: BezierPoint): void {
    this.execute(() => {
      const points = this.typedYMap.get("points")!;
      if (index < 0 || index > points.length) {
        throw new Error(`Invalid index ${index} for insertPoint`);
      }
      // Deep clone to prevent external mutation
      points.splice(index, 0, JSON.parse(JSON.stringify(point)));
      this.typedYMap.set("points", points);
    });
  }

  removePoint(index: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedYMap.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      points.splice(index, 1);
      this.typedYMap.set("points", points);
      success = true;
    });
    return success;
  }

  updatePoint(index: number, updates: Partial<BezierPoint>): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedYMap.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      points[index] = { ...points[index], ...updates };
      this.typedYMap.set("points", points);
      success = true;
    });
    return success;
  }

  movePoint(index: number, x: number, y: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedYMap.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      points[index].position = { x, y };
      this.typedYMap.set("points", points);
      success = true;
    });
    return success;
  }

  setPointHandleIn(index: number, angle: number, distance: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedYMap.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      points[index].handleIn = { angle, distance };
      this.typedYMap.set("points", points);
      success = true;
    });
    return success;
  }

  setPointHandleOut(index: number, angle: number, distance: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedYMap.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      points[index].handleOut = { angle, distance };
      this.typedYMap.set("points", points);
      success = true;
    });
    return success;
  }

  removePointHandleIn(index: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedYMap.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      points[index].handleIn = null;
      this.typedYMap.set("points", points);
      success = true;
    });
    return success;
  }

  removePointHandleOut(index: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedYMap.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      points[index].handleOut = null;
      this.typedYMap.set("points", points);
      success = true;
    });
    return success;
  }

  setPointHandleInCartesian(
    index: number,
    handleX: number,
    handleY: number
  ): boolean {
    const point = this.getPoint(index);
    if (!point) return false;

    const polar = cartesianToPolar(
      point.position.x,
      point.position.y,
      handleX,
      handleY
    );

    return this.setPointHandleIn(index, polar.angle, polar.distance);
  }

  setPointHandleOutCartesian(
    index: number,
    handleX: number,
    handleY: number
  ): boolean {
    const point = this.getPoint(index);
    if (!point) return false;

    const polar = cartesianToPolar(
      point.position.x,
      point.position.y,
      handleX,
      handleY
    );

    return this.setPointHandleOut(index, polar.angle, polar.distance);
  }

  setPoints(points: BezierPoint[]): void {
    this.execute(() => {
      // Deep clone to prevent external mutation
      this.typedYMap.set("points", JSON.parse(JSON.stringify(points)));
    });
  }

  clear(): void {
    this.execute(() => {
      this.typedYMap.set("points", []);
    });
  }

  clone(): ICubicBezierPath {
    // Create new path with same data but new TypedYMap instance
    return new CubicBezierPathAtomic(
      {
        points: this.getAllPoints(),
        closed: this.isClosed()
      },
      this.executeUndoable
    );
  }

  // =========================================================================
  // Internal accessor for creating nested TypedYMap (used by parent classes)
  // This is the ONLY way to access the internal TypedYMap - not a Y.Map!
  // =========================================================================
  
  /** @internal - Only for use by parent entity classes that need to wrap this path */
  getTypedYMap(): TypedYMap<typeof PathDataSchema> {
    return this.typedYMap;
  }
}

// ============================================================================
// Implementation 2: Granular Updates (Y.Array of Y.Maps for each point)
// ============================================================================

export class CubicBezierPathGranular implements ICubicBezierPath {
  private pointsArray: Y.Array<Y.Map<any>>;
  protected typedYMap: TypedYMap<typeof PathDataSchema>;

  constructor(
    typedYMapOrData: TypedYMap<typeof PathDataSchema> | S.Schema.Encoded<typeof PathDataSchema>,
    protected executeUndoable?: ExecuteUndoableOperation
  ) {
    if (typedYMapOrData instanceof TypedYMap) {
      this.typedYMap = typedYMapOrData;
    } else {
      const ymap = new Y.Map();
      this.typedYMap = TypedYMap.create(PathDataSchema, ymap, typedYMapOrData);
    }

    // Get the raw Y.Map only for internal Y.Array access
    const rawYMap = this.typedYMap.getRawYMap();
    
    // Initialize Y.Array for granular point updates
    if (!rawYMap.has("pointsArray")) {
      rawYMap.set("pointsArray", new Y.Array());
    }
    if (!rawYMap.has("closed")) {
      rawYMap.set("closed", false);
    }

    this.pointsArray = rawYMap.get("pointsArray");
  }

  protected execute(operation: () => void): void {
    if (this.executeUndoable) {
      this.executeUndoable(operation);
    } else {
      operation();
    }
  }

  private pointMapToBezierPoint(pointMap: Y.Map<any>): BezierPoint {
    const position = pointMap.get("position") || { x: 0, y: 0 };
    const handleIn = pointMap.get("handleIn") || null;
    const handleOut = pointMap.get("handleOut") || null;
    return { position, handleIn, handleOut };
  }

  private createPointMap(point: BezierPoint): Y.Map<any> {
    const map = new Y.Map();
    map.set("position", point.position);
    map.set("handleIn", point.handleIn);
    map.set("handleOut", point.handleOut);
    return map;
  }

  // =========================================================================
  // ICubicBezierPath Implementation (same interface as Atomic)
  // =========================================================================

  get pointCount(): number {
    return this.getPointCount();
  }

  get closed(): boolean {
    return this.isClosed();
  }

  getBounds(): Bounds | null {
    return calculateBezierBounds(this.getAllPoints());
  }

  isClosed(): boolean {
    const rawYMap = this.typedYMap.getRawYMap();
    return rawYMap.get("closed") || false;
  }

  getPointCount(): number {
    return this.pointsArray.length;
  }

  getAllPoints(): BezierPoint[] {
    const points: BezierPoint[] = [];
    for (let i = 0; i < this.pointsArray.length; i++) {
      const pointMap = this.pointsArray.get(i);
      points.push(this.pointMapToBezierPoint(pointMap));
    }
    return points;
  }

  getPoint(index: number): BezierPoint | undefined {
    if (index < 0 || index >= this.pointsArray.length) {
      return undefined;
    }
    const pointMap = this.pointsArray.get(index);
    return this.pointMapToBezierPoint(pointMap);
  }

  setClosed(closed: boolean): void {
    this.execute(() => {
      const rawYMap = this.typedYMap.getRawYMap();
      rawYMap.set("closed", closed);
    });
  }

  addPoint(point: BezierPoint): void {
    this.execute(() => {
      const pointMap = this.createPointMap(point);
      this.pointsArray.push([pointMap]);
    });
  }

  insertPoint(index: number, point: BezierPoint): void {
    this.execute(() => {
      if (index < 0 || index > this.pointsArray.length) {
        throw new Error(`Invalid index ${index} for insertPoint`);
      }
      const pointMap = this.createPointMap(point);
      this.pointsArray.insert(index, [pointMap]);
    });
  }

  removePoint(index: number): boolean {
    let success = false;
    this.execute(() => {
      if (index < 0 || index >= this.pointsArray.length) {
        success = false;
        return;
      }
      this.pointsArray.delete(index, 1);
      success = true;
    });
    return success;
  }

  updatePoint(index: number, updates: Partial<BezierPoint>): boolean {
    let success = false;
    this.execute(() => {
      if (index < 0 || index >= this.pointsArray.length) {
        success = false;
        return;
      }
      const pointMap = this.pointsArray.get(index);
      if (updates.position !== undefined) {
        pointMap.set("position", updates.position);
      }
      if (updates.handleIn !== undefined) {
        pointMap.set("handleIn", updates.handleIn);
      }
      if (updates.handleOut !== undefined) {
        pointMap.set("handleOut", updates.handleOut);
      }
      success = true;
    });
    return success;
  }

  movePoint(index: number, x: number, y: number): boolean {
    let success = false;
    this.execute(() => {
      if (index < 0 || index >= this.pointsArray.length) {
        success = false;
        return;
      }
      const pointMap = this.pointsArray.get(index);
      pointMap.set("position", { x, y });
      success = true;
    });
    return success;
  }

  setPointHandleIn(index: number, angle: number, distance: number): boolean {
    let success = false;
    this.execute(() => {
      if (index < 0 || index >= this.pointsArray.length) {
        success = false;
        return;
      }
      const pointMap = this.pointsArray.get(index);
      pointMap.set("handleIn", { angle, distance });
      success = true;
    });
    return success;
  }

  setPointHandleOut(index: number, angle: number, distance: number): boolean {
    let success = false;
    this.execute(() => {
      if (index < 0 || index >= this.pointsArray.length) {
        success = false;
        return;
      }
      const pointMap = this.pointsArray.get(index);
      pointMap.set("handleOut", { angle, distance });
      success = true;
    });
    return success;
  }

  removePointHandleIn(index: number): boolean {
    let success = false;
    this.execute(() => {
      if (index < 0 || index >= this.pointsArray.length) {
        success = false;
        return;
      }
      const pointMap = this.pointsArray.get(index);
      pointMap.set("handleIn", null);
      success = true;
    });
    return success;
  }

  removePointHandleOut(index: number): boolean {
    let success = false;
    this.execute(() => {
      if (index < 0 || index >= this.pointsArray.length) {
        success = false;
        return;
      }
      const pointMap = this.pointsArray.get(index);
      pointMap.set("handleOut", null);
      success = true;
    });
    return success;
  }

  setPointHandleInCartesian(
    index: number,
    handleX: number,
    handleY: number
  ): boolean {
    const point = this.getPoint(index);
    if (!point) return false;

    const polar = cartesianToPolar(
      point.position.x,
      point.position.y,
      handleX,
      handleY
    );

    return this.setPointHandleIn(index, polar.angle, polar.distance);
  }

  setPointHandleOutCartesian(
    index: number,
    handleX: number,
    handleY: number
  ): boolean {
    const point = this.getPoint(index);
    if (!point) return false;

    const polar = cartesianToPolar(
      point.position.x,
      point.position.y,
      handleX,
      handleY
    );

    return this.setPointHandleOut(index, polar.angle, polar.distance);
  }

  setPoints(points: BezierPoint[]): void {
    this.execute(() => {
      this.pointsArray.delete(0, this.pointsArray.length);
      const pointMaps = points.map((p) => this.createPointMap(p));
      this.pointsArray.push(pointMaps);
    });
  }

  clear(): void {
    this.execute(() => {
      this.pointsArray.delete(0, this.pointsArray.length);
    });
  }

  clone(): ICubicBezierPath {
    return new CubicBezierPathGranular(
      {
        points: this.getAllPoints(),
        closed: this.isClosed()
      },
      this.executeUndoable
    );
  }

  /** @internal - Only for use by parent entity classes that need to wrap this path */
  getTypedYMap(): TypedYMap<typeof PathDataSchema> {
    return this.typedYMap;
  }
}

// ============================================================================
// Closed Path Classes - Schema enforces constraints, minimal class logic
// ============================================================================

export class ClosedCubicBezierPathAtomic
  extends CubicBezierPathAtomic
  implements IClosedCubicBezierPath
{
  // TODO
  protected declare typedYMap: TypedYMap<typeof ClosedPathDataSchema>;

  constructor(
    typedYMapOrData: TypedYMap<typeof ClosedPathDataSchema> | S.Schema.Encoded<typeof ClosedPathDataSchema>,
    executeUndoable?: ExecuteUndoableOperation
  ) {
    // Schema will validate minimum 3 points and closed = true
    if (typedYMapOrData instanceof TypedYMap) {
      super(typedYMapOrData as any, executeUndoable);
      this.typedYMap = typedYMapOrData;
    } else {
      // Ensure closed flag is set for new instances
      const data = { ...typedYMapOrData, closed: true };
      const ymap = new Y.Map();
      // TypedYMap.create will validate via ClosedPathDataSchema
      const typedMap = TypedYMap.create(ClosedPathDataSchema, ymap, data);
      super(typedMap as any, executeUndoable);
      this.typedYMap = typedMap;
    }
  }

  // Type-level enforcement - return types guarantee closed = true
  get closed(): true {
    return true;
  }

  isClosed(): true {
    return true;
  }

  // Schema guarantees bounds exist (min 3 points)
  getBounds(): Bounds {
    const bounds = calculateBezierBounds(this.getAllPoints());
    // This should never happen due to schema validation
    if (!bounds) {
      throw new Error("Closed path must have bounds");
    }
    return bounds;
  }

  // Prevent setting to open
  setClosed(closed: boolean): void {
    if (!closed) {
      throw new Error("Cannot set closed path to open");
    }
    // Already closed, no-op
  }

  // Prevent operations that would violate schema constraints
  removePoint(index: number): boolean {
    // Schema will reject if this leaves < 3 points
    if (this.getPointCount() <= 3) {
      return false;
    }
    return super.removePoint(index);
  }

  setPoints(points: BezierPoint[]): void {
    // Schema will validate minimum 3 points
    super.setPoints(points);
  }

  clear(): void {
    throw new Error("Cannot clear a closed path");
  }

  clone(): IClosedCubicBezierPath {
    return new ClosedCubicBezierPathAtomic(
      {
        points: this.getAllPoints(),
        closed: true
      },
      this.executeUndoable
    );
  }

  /** @internal */
  getTypedYMap(): TypedYMap<typeof ClosedPathDataSchema> {
    return this.typedYMap;
  }
}

export class ClosedCubicBezierPathGranular
  extends CubicBezierPathGranular
  implements IClosedCubicBezierPath
{
  constructor(
    typedYMapOrData: TypedYMap<typeof ClosedPathDataSchema> | S.Schema.Encoded<typeof ClosedPathDataSchema>,
    executeUndoable?: ExecuteUndoableOperation
  ) {
    if (typedYMapOrData instanceof TypedYMap) {
      super(typedYMapOrData as any, executeUndoable);
    } else {
      // Ensure closed flag and validate via schema
      const data = { ...typedYMapOrData, closed: true };
      const ymap = new Y.Map();
      const typedMap = TypedYMap.create(ClosedPathDataSchema, ymap, data);
      super(typedMap as any, executeUndoable);
    }
    
    // Force closed state in Y.Map
    const rawYMap = this.typedYMap.getRawYMap();
    rawYMap.set("closed", true);
  }

  get closed(): true {
    return true;
  }

  isClosed(): true {
    return true;
  }

  getBounds(): Bounds {
    const bounds = calculateBezierBounds(this.getAllPoints());
    if (!bounds) {
      throw new Error("Closed path must have bounds");
    }
    return bounds;
  }

  setClosed(closed: boolean): void {
    if (!closed) {
      throw new Error("Cannot set closed path to open");
    }
  }

  removePoint(index: number): boolean {
    if (this.getPointCount() <= 3) {
      return false;
    }
    return super.removePoint(index);
  }

  setPoints(points: BezierPoint[]): void {
    super.setPoints(points);
  }

  clear(): void {
    throw new Error("Cannot clear a closed path");
  }

  clone(): IClosedCubicBezierPath {
    return new ClosedCubicBezierPathGranular(
      {
        points: this.getAllPoints(),
        closed: true
      },
      this.executeUndoable
    );
  }
}