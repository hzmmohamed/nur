/**
 * Refactored Cubic Bezier Path Implementation - Using TypedYStruct API
 *
 * This implementation uses the improved separated composition API from impl-composition-separated.ts
 * Key changes:
 * 1. Uses TypedYStruct instead of TypedYMap
 * 2. Cleaner API with .get() and .set() for simple fields
 * 3. Only includes Atomic implementations (Granular variants discarded as requested)
 */

import * as Y from "yjs";
import type { BezierPoint, Bounds } from "../coordinate-utils";
import { cartesianToPolar, calculateBezierBounds } from "../coordinate-utils";
import type { ICubicBezierPath, IClosedCubicBezierPath } from "../interfaces";
import { TypedYStruct } from "@/lib/yjs-utils/typed-wrappers/impl-composition-separated";
import { PathDataSchema, ClosedPathDataSchema } from "../schemas-effect";
import type { Schema as S } from "effect";

// Type for the injected undo tracking function
type ExecuteUndoableOperation = (operation: () => void) => void;

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

// ============================================================================
// CubicBezierPathAtomic - Open or Closed Path (Atomic Updates)
// ============================================================================

export class CubicBezierPathAtomic implements ICubicBezierPath {
  protected typedStruct: TypedYStruct<typeof PathDataSchema>;

  /**
   * Constructor accepts either:
   * - A pre-created TypedYStruct (when wrapping existing data)
   * - Initial data (when creating new path)
   */
  constructor(
    typedStructOrData:
      | TypedYStruct<typeof PathDataSchema>
      | S.Schema.Encoded<typeof PathDataSchema>,
    protected executeUndoable?: ExecuteUndoableOperation
  ) {
    if (typedStructOrData instanceof TypedYStruct) {
      // Wrapping existing TypedYStruct
      this.typedStruct = typedStructOrData;
    } else {
      // Creating new from data - TypedYStruct creates Y.Map internally
      const ymap = new Y.Map();
      this.typedStruct = new TypedYStruct(ymap, PathDataSchema);
      // Initialize with provided data
      this.typedStruct.set("points", typedStructOrData.points);
      this.typedStruct.set("closed", typedStructOrData.closed);
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
    return this.typedStruct.get("closed")!;
  }

  getPointCount(): number {
    const points = this.typedStruct.get("points")!;
    return points.length;
  }

  getAllPoints(): BezierPoint[] {
    const points = this.typedStruct.get("points")!;
    // Deep clone to prevent external mutation
    return JSON.parse(JSON.stringify(points));
  }

  getPoint(index: number): BezierPoint | undefined {
    const points = this.typedStruct.get("points")!;
    if (index < 0 || index >= points.length) {
      return undefined;
    }
    // Deep clone to prevent external mutation
    return JSON.parse(JSON.stringify(points[index]));
  }

  setClosed(closed: boolean): void {
    this.execute(() => {
      this.typedStruct.set("closed", closed);
    });
  }

  addPoint(point: BezierPoint): void {
    this.execute(() => {
      const points = this.typedStruct.get("points")!;
      // Deep clone to prevent external mutation
      const newPoints = [...points, JSON.parse(JSON.stringify(point))];
      this.typedStruct.set("points", newPoints);
    });
  }

  insertPoint(index: number, point: BezierPoint): void {
    this.execute(() => {
      const points = this.typedStruct.get("points")!;
      if (index < 0 || index > points.length) {
        throw new Error(`Invalid index ${index} for insertPoint`);
      }
      // Deep clone to prevent external mutation
      const newPoints = [...points];
      newPoints.splice(index, 0, JSON.parse(JSON.stringify(point)));
      this.typedStruct.set("points", newPoints);
    });
  }

  removePoint(index: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedStruct.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      const newPoints = [...points];
      newPoints.splice(index, 1);
      this.typedStruct.set("points", newPoints);
      success = true;
    });
    return success;
  }

  updatePoint(index: number, updates: Partial<BezierPoint>): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedStruct.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      const newPoints = [...points];
      newPoints[index] = { ...newPoints[index], ...updates };
      this.typedStruct.set("points", newPoints);
      success = true;
    });
    return success;
  }

  movePoint(index: number, x: number, y: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedStruct.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      const newPoints = [...points] as DeepWriteable<typeof points>;
      newPoints[index].position = { x, y };
      this.typedStruct.set("points", newPoints);
      success = true;
    });
    return success;
  }

  setPointHandleIn(index: number, angle: number, distance: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedStruct.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      const newPoints = [...points] as DeepWriteable<typeof points>;
      newPoints[index].handleIn = { angle, distance };
      this.typedStruct.set("points", newPoints);
      success = true;
    });
    return success;
  }

  setPointHandleOut(index: number, angle: number, distance: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedStruct.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      const newPoints = [...points] as DeepWriteable<typeof points>;
      newPoints[index].handleOut = { angle, distance };
      this.typedStruct.set("points", newPoints);
      success = true;
    });
    return success;
  }

  removePointHandleIn(index: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedStruct.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      const newPoints = [...points] as DeepWriteable<typeof points>;
      newPoints[index].handleIn = null;
      this.typedStruct.set("points", newPoints);
      success = true;
    });
    return success;
  }

  removePointHandleOut(index: number): boolean {
    let success = false;
    this.execute(() => {
      const points = this.typedStruct.get("points")!;
      if (index < 0 || index >= points.length) {
        success = false;
        return;
      }
      const newPoints = [...points] as DeepWriteable<typeof points>;
      newPoints[index].handleOut = null;
      this.typedStruct.set("points", newPoints);
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
      this.typedStruct.set("points", JSON.parse(JSON.stringify(points)));
    });
  }

  clear(): void {
    this.execute(() => {
      this.typedStruct.set("points", []);
    });
  }

  clone(): ICubicBezierPath {
    // Create new path with same data but new TypedYStruct instance
    return new CubicBezierPathAtomic(
      {
        points: this.getAllPoints(),
        closed: this.isClosed(),
      },
      this.executeUndoable
    );
  }

  // =========================================================================
  // Internal accessor for creating nested TypedYStruct (used by parent classes)
  // This is the ONLY way to access the internal TypedYStruct - not a Y.Map!
  // =========================================================================

  /** @internal - Only for use by parent entity classes that need to wrap this path */
  getTypedStruct(): TypedYStruct<typeof PathDataSchema> {
    return this.typedStruct;
  }
}

// ============================================================================
// ClosedCubicBezierPathAtomic - Always Closed Path (Schema Enforced)
// ============================================================================

export class ClosedCubicBezierPathAtomic
  extends CubicBezierPathAtomic
  implements IClosedCubicBezierPath
{
  // @ts-expect-error - I think it's due to the minItems filter on the schema
  protected declare typedStruct: TypedYStruct<typeof ClosedPathDataSchema>;

  constructor(
    typedStructOrData:
      | TypedYStruct<typeof ClosedPathDataSchema>
      | S.Schema.Encoded<typeof ClosedPathDataSchema>,
    executeUndoable?: ExecuteUndoableOperation
  ) {
    // Schema will validate minimum 3 points and closed = true
    if (typedStructOrData instanceof TypedYStruct) {
      super(typedStructOrData as any, executeUndoable);
      this.typedStruct = typedStructOrData;
    } else {
      // Ensure closed flag is set for new instances
      const data = { ...typedStructOrData, closed: true as const };
      const ymap = new Y.Map();
      // TypedYStruct constructor will validate via ClosedPathDataSchema
      const typedStruct = new TypedYStruct(ymap, ClosedPathDataSchema);

      // Initialize with validated data
      typedStruct.set("points", data.points);
      typedStruct.set("closed", data.closed);

      super(typedStruct as any, executeUndoable);
      this.typedStruct = typedStruct;
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
    if (points.length < 3) {
      throw new Error("Closed path must have at least 3 points");
    }
    super.setPoints(points);
  }

  clear(): void {
    throw new Error("Cannot clear a closed path");
  }

  clone(): IClosedCubicBezierPath {
    return new ClosedCubicBezierPathAtomic(
      {
        points: this.getAllPoints(),
        closed: true as const,
      },
      this.executeUndoable
    );
  }

  /** @internal */
  // @ts-expect-error
  getTypedStruct(): TypedYStruct<typeof ClosedPathDataSchema> {
    return this.typedStruct;
  }
}
