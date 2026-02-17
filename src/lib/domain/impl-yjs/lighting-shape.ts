/**
 * Refactored LightingLayerShape Implementation
 * 
 * Changes from original:
 * 1. Constructor accepts TypedYMap OR data (no raw Y.Map)
 * 2. Removed .ymap getter - no Y.Map exposure
 * 3. Path initialization uses TypedYMap, not raw Y.Map
 * 4. Added getTypedYMap() for parent classes
 * 5. Both inner and outer paths initialized via getNestedMap()
 */

import * as Y from "yjs";
import type { ILightingLayerShape, IClosedCubicBezierPath, FalloffType } from "../interfaces";
import type { Bounds } from "../coordinate-utils";
import { boundsContains } from "../coordinate-utils";
import { TypedYMap } from "@/lib/yjs-utils/typed-wrappers/impl-composition-recursive";
import { LightingLayerShapeSchema } from "../schemas-effect";
import type { Schema as S } from "effect";
import {
  ClosedCubicBezierPathAtomic,
  ClosedCubicBezierPathGranular,
} from "./cubic-bezier-path";

type ExecuteUndoableOperation = (operation: () => void) => void;

export class LightingLayerShape implements ILightingLayerShape {
  private typedYMap: TypedYMap<typeof LightingLayerShapeSchema>;
  private innerPath: IClosedCubicBezierPath;
  private outerPath: IClosedCubicBezierPath;

  constructor(
    typedYMapOrData: TypedYMap<typeof LightingLayerShapeSchema> | S.Schema.Encoded<typeof LightingLayerShapeSchema>,
    private executeUndoable?: ExecuteUndoableOperation,
    private useGranularPath: boolean = false
  ) {
    if (typedYMapOrData instanceof TypedYMap) {
      // Wrapping existing TypedYMap
      this.typedYMap = typedYMapOrData;
    } else {
      // Creating new from data - TypedYMap creates Y.Map internally
      const ymap = new Y.Map();
      this.typedYMap = TypedYMap.create(LightingLayerShapeSchema, ymap, typedYMapOrData);
    }

    // Get the nested path TypedYMaps (not raw Y.Maps!)
    const innerPathDataTypedMap = this.typedYMap.getNestedMap("innerPathData")!;
    const outerPathDataTypedMap = this.typedYMap.getNestedMap("outerPathData")!;

    // Create the appropriate path implementations, passing TypedYMap
    if (useGranularPath) {
      this.innerPath = new ClosedCubicBezierPathGranular(
        innerPathDataTypedMap,
        executeUndoable
      );
      this.outerPath = new ClosedCubicBezierPathGranular(
        outerPathDataTypedMap,
        executeUndoable
      );
    } else {
      this.innerPath = new ClosedCubicBezierPathAtomic(
        innerPathDataTypedMap,
        executeUndoable
      );
      this.outerPath = new ClosedCubicBezierPathAtomic(
        outerPathDataTypedMap,
        executeUndoable
      );
    }
  }

  private execute(operation: () => void): void {
    if (this.executeUndoable) {
      this.executeUndoable(operation);
    } else {
      operation();
    }
  }

  // =========================================================================
  // ILightingLayerShape Implementation
  // =========================================================================

  // Identifiable
  get id(): string {
    return this.typedYMap.get("id")!;
  }

  // Frame association (immutable)
  get frameId(): string {
    return this.typedYMap.get("frameId")!;
  }

  // Lighting properties
  get baseColor(): string {
    return this.typedYMap.get("baseColor")!;
  }

  set baseColor(value: string) {
    this.execute(() => {
      this.typedYMap.set("baseColor", value);
    });
  }

  get intensity(): number {
    return this.typedYMap.get("intensity")!;
  }

  set intensity(value: number) {
    this.execute(() => {
      // Schema handles clamping to [0, 1]
      this.typedYMap.set("intensity", value);
    });
  }

  get falloffType(): FalloffType {
    return this.typedYMap.get("falloffType")!;
  }

  set falloffType(value: FalloffType) {
    this.execute(() => {
      this.typedYMap.set("falloffType", value);
    });
  }

  get falloffExponent(): number {
    return this.typedYMap.get("falloffExponent")!;
  }

  set falloffExponent(value: number) {
    this.execute(() => {
      // Schema handles clamping to [0.1, 10]
      this.typedYMap.set("falloffExponent", value);
    });
  }

  // Path Access
  getInnerPath(): IClosedCubicBezierPath {
    return this.innerPath;
  }

  getOuterPath(): IClosedCubicBezierPath {
    return this.outerPath;
  }

  // Computed Properties
  getInnerBounds(): Bounds {
    return this.innerPath.getBounds();
  }

  getOuterBounds(): Bounds {
    return this.outerPath.getBounds();
  }

  // Validation - Business rule: inner path must be contained by outer path
  isValid(): boolean {
    const innerBounds = this.getInnerBounds();
    const outerBounds = this.getOuterBounds();
    return boundsContains(outerBounds, innerBounds);
  }

  // Cloning
  clone(): ILightingLayerShape {
    const newShape = new LightingLayerShape(
      {
        id: crypto.randomUUID(),
        frameId: this.frameId,
        innerPathData: {
          points: this.innerPath.getAllPoints(),
          closed: true,
        },
        outerPathData: {
          points: this.outerPath.getAllPoints(),
          closed: true,
        },
        baseColor: this.baseColor,
        intensity: this.intensity,
        falloffType: this.falloffType,
        falloffExponent: this.falloffExponent,
      },
      this.executeUndoable,
      this.useGranularPath
    );

    return newShape;
  }

  // =========================================================================
  // Internal accessor for parent classes (LightingLayer)
  // Returns TypedYMap, NOT raw Y.Map
  // =========================================================================
  
  /** @internal - Only for use by parent entity classes */
  getTypedYMap(): TypedYMap<typeof LightingLayerShapeSchema> {
    return this.typedYMap;
  }
}