/**
 * Refactored LightingLayer Implementation
 *
 * Changes from original:
 * 1. Constructor accepts TypedYMap OR data (no raw Y.Map)
 * 2. Removed .ymap getter - no Y.Map exposure
 * 3. Collection management uses TypedYMap methods where available
 * 4. Added getTypedYMap() for parent classes
 *
 * Same collection issues as MaskingLayer - marked with TODOs
 */

import * as Y from "yjs";
import type { BezierPoint } from "../coordinate-utils";
import type {
  BlendModeType,
  IClosedCubicBezierPath,
  ILightingLayer,
  ILightingLayerShape,
} from "../interfaces";
import { TypedYMap } from "@/lib/yjs-utils/typed-wrappers/impl-composition-recursive";
import { LightingLayerSchema } from "../schemas-effect";
import type { Schema as S } from "effect";
import { LightingLayerShape } from "./lighting-shape";

type ExecuteUndoableOperation = (operation: () => void) => void;

export class LightingLayer implements ILightingLayer {
  private typedYMap: TypedYMap<typeof LightingLayerSchema>;

  constructor(
    typedYMapOrData:
      | TypedYMap<typeof LightingLayerSchema>
      | S.Schema.Encoded<typeof LightingLayerSchema>,
    private executeUndoable?: ExecuteUndoableOperation,
    private useGranularPath: boolean = false
  ) {
    if (typedYMapOrData instanceof TypedYMap) {
      // Wrapping existing TypedYMap
      this.typedYMap = typedYMapOrData;
    } else {
      // Creating new from data - TypedYMap creates Y.Map internally
      const ymap = new Y.Map();
      this.typedYMap = TypedYMap.create(
        LightingLayerSchema,
        ymap,
        typedYMapOrData
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
  // ILightingLayer Implementation
  // =========================================================================

  // Identifiable
  get id(): string {
    return this.typedYMap.get("id")!;
  }

  // Masking Layer association
  get maskingLayerId(): string {
    return this.typedYMap.get("maskingLayerId")!;
  }

  // Named
  get name(): string {
    return this.typedYMap.get("name")!;
  }

  set name(value: string) {
    this.execute(() => {
      this.typedYMap.set("name", value);
    });
  }

  // Visible
  get visible(): boolean {
    return this.typedYMap.get("visible")!;
  }

  set visible(value: boolean) {
    this.execute(() => {
      this.typedYMap.set("visible", value);
    });
  }

  // Ordered
  get order(): number {
    return this.typedYMap.get("order") || 0;
  }

  set order(value: number) {
    this.execute(() => {
      this.typedYMap.set("order", value);
    });
  }

  // Blend properties
  get blendMode(): BlendModeType {
    return this.typedYMap.get("blendMode")!;
  }

  set blendMode(value: BlendModeType) {
    this.execute(() => {
      this.typedYMap.set("blendMode", value);
    });
  }

  get opacity(): number {
    return this.typedYMap.get("opacity")!;
  }

  set opacity(value: number) {
    this.execute(() => {
      // Schema handles clamping to [0, 1]
      this.typedYMap.set("opacity", value);
    });
  }

  // Optional properties
  get metadata(): Record<string, any> | undefined {
    const meta = this.typedYMap.get("metadata");
    return meta ? JSON.parse(JSON.stringify(meta)) : undefined;
  }

  set metadata(value: Record<string, any> | undefined) {
    this.execute(() => {
      if (value === undefined) {
        this.typedYMap.delete("metadata");
      } else {
        this.typedYMap.set("metadata", JSON.parse(JSON.stringify(value)));
      }
    });
  }

  // =========================================================================
  // Shape Management
  // =========================================================================

  createShapeForFrame(
    frameId: string,
    innerPoints: BezierPoint[],
    outerPoints: BezierPoint[]
  ): ILightingLayerShape {
    if (innerPoints.length < 3 || outerPoints.length < 3) {
      throw new Error("Closed paths require at least 3 points");
    }

    let shape: ILightingLayerShape;

    this.execute(() => {
      // Create new shape data with default lighting properties
      const shapeData = {
        id: crypto.randomUUID(),
        frameId: frameId,
        innerPathData: {
          points: innerPoints,
          closed: true,
        },
        outerPathData: {
          points: outerPoints,
          closed: true,
        },
        baseColor: "#ffffff",
        intensity: 1.0,
        falloffType: "linear" as const,
        falloffExponent: 1.0,
      };

      // Create LightingLayerShape instance with data
      shape = new LightingLayerShape(
        shapeData,
        this.executeUndoable,
        this.useGranularPath
      );

      // Add shape to nested record structure using TypedYMap methods
      const frameRecord = this.typedYMap.getFromRecord(
        "framesToShapesMap",
        frameId
      );

      if (!frameRecord) {
        throw new Error(`Could not create frame record for ${frameId}`);
      }

      // Get shape's TypedYMap and add to record
      const shapeTypedYMap = (shape as any).getTypedYMap();
      const shapeRawYMap = shapeTypedYMap.getRawYMap();

      // TODO: Add setInNestedRecord() method to TypedYMap to avoid getRawYMap()
      const rawFrameRecord = (frameRecord as any).getRawYMap();
      rawFrameRecord.set(shape!.id, shapeRawYMap);
    });

    return shape!;
  }

  createShapeForFrameFromPaths(
    frameId: string,
    innerPath: IClosedCubicBezierPath,
    outerPath: IClosedCubicBezierPath
  ): ILightingLayerShape {
    return this.createShapeForFrame(
      frameId,
      innerPath.getAllPoints(),
      outerPath.getAllPoints()
    );
  }

  addShapeToFrame(frameId: string, shape: ILightingLayerShape): void {
    this.execute(() => {
      // Get or create frame record using TypedYMap
      const frameRecord = this.typedYMap.getFromRecord(
        "framesToShapesMap",
        frameId
      );

      if (!frameRecord) {
        throw new Error(`Could not create frame record for ${frameId}`);
      }

      // Get shape's TypedYMap and add to record
      const shapeTypedYMap = (shape as any).getTypedYMap();
      const shapeRawYMap = shapeTypedYMap.getRawYMap();

      // TODO: Add setInNestedRecord() method to TypedYMap to avoid getRawYMap()
      const rawFrameRecord = (frameRecord as any).getRawYMap();
      rawFrameRecord.set(shape.id, shapeRawYMap);
    });
  }

  removeShapeFromFrame(frameId: string, shapeId: string): boolean {
    let success = false;

    this.execute(() => {
      // Check if frame record exists using new method
      if (!this.typedYMap.hasRecordKey("framesToShapesMap", frameId)) {
        success = false;
        return;
      }

      const frameRecord = this.typedYMap.getFromRecord(
        "framesToShapesMap",
        frameId
      );
      if (!frameRecord) {
        success = false;
        return;
      }

      // TODO: Add deleteFromNestedRecord() method to TypedYMap to avoid getRawYMap()
      const rawFrameRecord = (frameRecord as any).getRawYMap();
      if (!rawFrameRecord.has(shapeId)) {
        success = false;
        return;
      }

      rawFrameRecord.delete(shapeId);
      success = true;
    });

    return success;
  }

  removeAllShapesForFrame(frameId: string): boolean {
    let success = false;

    this.execute(() => {
      // Check if frame exists using new method
      if (!this.typedYMap.hasRecordKey("framesToShapesMap", frameId)) {
        success = false;
        return;
      }

      // TODO: Add deleteFromRecord() method to TypedYMap to avoid getRawYMap()
      const framesMap = this.typedYMap.getRawYMap().get("framesToShapesMap");
      framesMap.delete(frameId);
      success = true;
    });

    return success;
  }

  // =========================================================================
  // Shape Queries
  // =========================================================================

  getShapesForFrame(frameId: string): ILightingLayerShape[] {
    // Check if frame has any shapes using new method
    if (!this.typedYMap.hasRecordKey("framesToShapesMap", frameId)) {
      return [];
    }

    const frameRecord = this.typedYMap.getFromRecord(
      "framesToShapesMap",
      frameId
    );
    if (!frameRecord) {
      return [];
    }

    const shapes: ILightingLayerShape[] = [];

    // TODO: Add iteration support for top-level Record TypedYMap
    const rawFrameRecord = (frameRecord as any).getRawYMap();
    for (const [shapeId, shapeYMap] of rawFrameRecord.entries()) {
      if (!(shapeYMap instanceof Y.Map)) continue;

      // Wrap in TypedYMap
      const shapeTypedYMap = TypedYMap.create(
        require("../schemas-effect").LightingLayerShapeSchema,
        shapeYMap
      );

      shapes.push(
        new LightingLayerShape(
          shapeTypedYMap,
          this.executeUndoable,
          this.useGranularPath
        )
      );
    }

    return shapes;
  }

  getShapeById(
    frameId: string,
    shapeId: string
  ): ILightingLayerShape | undefined {
    const shapes = this.getShapesForFrame(frameId);
    return shapes.find((shape) => shape.id === shapeId);
  }

  getDefinedFrameIds(): string[] {
    // Use new TypedYMap method
    return this.typedYMap.getRecordKeys("framesToShapesMap");
  }

  hasShapesForFrame(frameId: string): boolean {
    // Use new TypedYMap method
    if (!this.typedYMap.hasRecordKey("framesToShapesMap", frameId)) {
      return false;
    }

    const frameRecord = this.typedYMap.getFromRecord(
      "framesToShapesMap",
      frameId
    );
    if (!frameRecord) {
      return false;
    }

    // TODO: Add size() or isEmpty() method to TypedYMap for top-level Records
    const rawFrameRecord = (frameRecord as any).getRawYMap();
    return rawFrameRecord.size > 0;
  }

  getTotalShapeCount(): number {
    let count = 0;

    // Iterate over all frame IDs using new method
    const frameIds = this.typedYMap.getRecordKeys("framesToShapesMap");

    for (const frameId of frameIds) {
      const frameRecord = this.typedYMap.getFromRecord(
        "framesToShapesMap",
        frameId
      );
      if (frameRecord) {
        // TODO: Add size() method to TypedYMap for Records
        const rawFrameRecord = (frameRecord as any).getRawYMap();
        count += rawFrameRecord.size;
      }
    }

    return count;
  }

  getShapeCountForFrame(frameId: string): number {
    return this.getShapesForFrame(frameId).length;
  }

  // =========================================================================
  // Cloning
  // =========================================================================

  clone(): ILightingLayer {
    const newLayer = new LightingLayer(
      {
        id: crypto.randomUUID(),
        maskingLayerId: this.maskingLayerId,
        name: this.name,
        visible: this.visible,
        order: this.order,
        blendMode: this.blendMode,
        opacity: this.opacity,
        metadata: this.metadata
          ? JSON.parse(JSON.stringify(this.metadata))
          : undefined,
        framesToShapesMap: {}, // Will be populated below
      },
      this.executeUndoable,
      this.useGranularPath
    );

    // Clone all shapes for all frames
    for (const frameId of this.getDefinedFrameIds()) {
      const shapes = this.getShapesForFrame(frameId);
      for (const shape of shapes) {
        const clonedShape = shape.clone();
        newLayer.addShapeToFrame(frameId, clonedShape);
      }
    }

    return newLayer;
  }

  // =========================================================================
  // Internal accessor for parent classes (AnimationProject)
  // Returns TypedYMap, NOT raw Y.Map
  // =========================================================================

  /** @internal - Only for use by parent entity classes */
  getTypedYMap(): TypedYMap<typeof LightingLayerSchema> {
    return this.typedYMap;
  }
}
