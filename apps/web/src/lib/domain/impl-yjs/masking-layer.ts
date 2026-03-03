/**
 * Refactored MaskingLayer Implementation
 * 
 * Changes from original:
 * 1. Constructor accepts TypedYMap OR data (no raw Y.Map)
 * 2. Removed .ymap getter - no Y.Map exposure
 * 3. Collection management uses TypedYMap methods, not raw Y.Map navigation
 * 4. Shape creation and retrieval work with TypedYMap wrappers
 * 
 * Key Challenge:
 * - Need to manage Record<frameId, Record<shapeId, Shape>> structure
 * - Currently using getRawYMap() to navigate nested records
 * - TODO: Should add TypedYMap helper methods for nested record operations
 */

import * as Y from "yjs";
import type { BezierPoint } from "../coordinate-utils";
import type { IClosedCubicBezierPath, IMaskingLayer, IMaskingShape } from "../interfaces";
import { TypedYMap } from "@/lib/yjs-utils/typed-wrappers/impl-composition-recursive";
import { MaskingLayerSchema } from "../schemas-effect";
import type { Schema as S } from "effect";
import { MaskingShape } from "./masking-shape";

type ExecuteUndoableOperation = (operation: () => void) => void;

export class MaskingLayer implements IMaskingLayer {
  private typedYMap: TypedYMap<typeof MaskingLayerSchema>;

  constructor(
    typedYMapOrData: TypedYMap<typeof MaskingLayerSchema> | S.Schema.Encoded<typeof MaskingLayerSchema>,
    private executeUndoable?: ExecuteUndoableOperation,
    private useGranularPath: boolean = false
  ) {
    if (typedYMapOrData instanceof TypedYMap) {
      // Wrapping existing TypedYMap
      this.typedYMap = typedYMapOrData;
    } else {
      // Creating new from data - TypedYMap creates Y.Map internally
      const ymap = new Y.Map();
      this.typedYMap = TypedYMap.create(MaskingLayerSchema, ymap, typedYMapOrData);
    }
  }

  private execute(operation: () => void): void {
    if (this.executeUndoable) {
      this.executeUndoable(operation);
    } else {
      operation();
    }
  }

  // No longer needed - using TypedYMap collection methods directly

  // =========================================================================
  // IMaskingLayer Implementation
  // =========================================================================

  // Identifiable
  get id(): string {
    return this.typedYMap.get("id")!;
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

  // Optional properties
  get color(): string | undefined {
    return this.typedYMap.get("color");
  }

  set color(value: string | undefined) {
    this.execute(() => {
      if (value === undefined) {
        this.typedYMap.delete("color");
      } else {
        this.typedYMap.set("color", value);
      }
    });
  }

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

  createShapeForFrame(frameId: string, points: BezierPoint[]): IMaskingShape {
    if (points.length < 3) {
      throw new Error("Closed path requires at least 3 points");
    }

    let shape: IMaskingShape;

    this.execute(() => {
      // Create new shape data
      const shapeData = {
        id: crypto.randomUUID(),
        frameId: frameId,
        pathData: {
          points: points,
          closed: true,
        },
      };

      // Create MaskingShape instance with data
      shape = new MaskingShape(
        shapeData,
        this.executeUndoable,
        this.useGranularPath
      );

      // Add shape to nested record structure using TypedYMap methods
      // Get or create the shapes record for this frame
      const frameRecord = this.typedYMap.getFromRecord("framesToShapesMap", frameId);
      
      if (!frameRecord) {
        // TypedYMap will create the nested structure automatically
        const newFrameRecord = this.typedYMap.getFromRecord("framesToShapesMap", frameId);
        // Get shape's TypedYMap and add to record
        const shapeTypedYMap = (shape as any).getTypedYMap();
        const shapeRawYMap = shapeTypedYMap.getRawYMap();
        
        // Access the underlying Y.Map to set the shape
        const rawFrameRecord = (newFrameRecord as any).getRawYMap();
        rawFrameRecord.set(shape!.id, shapeRawYMap);
      } else {
        // Frame record exists, add shape to it
        const shapeTypedYMap = (shape as any).getTypedYMap();
        const shapeRawYMap = shapeTypedYMap.getRawYMap();
        
        const rawFrameRecord = (frameRecord as any).getRawYMap();
        rawFrameRecord.set(shape!.id, shapeRawYMap);
      }
    });

    return shape!;
  }

  createShapeForFrameFromPath(
    frameId: string,
    path: IClosedCubicBezierPath
  ): IMaskingShape {
    return this.createShapeForFrame(frameId, path.getAllPoints());
  }

  addShapeToFrame(frameId: string, shape: IMaskingShape): void {
    this.execute(() => {
      // Get or create frame record using TypedYMap
      const frameRecord = this.typedYMap.getFromRecord("framesToShapesMap", frameId);
      
      if (!frameRecord) {
        throw new Error(`Could not create frame record for ${frameId}`);
      }

      // Get shape's TypedYMap and add to record
      const shapeTypedYMap = (shape as any).getTypedYMap();
      const shapeRawYMap = shapeTypedYMap.getRawYMap();
      
      // Access underlying Y.Map to set the shape
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

      const frameRecord = this.typedYMap.getFromRecord("framesToShapesMap", frameId);
      if (!frameRecord) {
        success = false;
        return;
      }

      // Access underlying Y.Map to delete the shape
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

      // Delete entire frame entry
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

  getShapesForFrame(frameId: string): IMaskingShape[] {
    // Check if frame has any shapes using new method
    if (!this.typedYMap.hasRecordKey("framesToShapesMap", frameId)) {
      return [];
    }

    const frameRecord = this.typedYMap.getFromRecord("framesToShapesMap", frameId);
    if (!frameRecord) {
      return [];
    }

    const shapes: IMaskingShape[] = [];
    
    // frameRecord is a TypedYMap<Record<shapeId, MaskingShapeSchema>>
    // We need to iterate over its entries
    // TODO: This still requires getRawYMap() until we add proper iteration for top-level Records
    const rawFrameRecord = (frameRecord as any).getRawYMap();
    for (const [shapeId, shapeYMap] of rawFrameRecord.entries()) {
      if (!(shapeYMap instanceof Y.Map)) continue;
      
      // Wrap in TypedYMap
      const shapeTypedYMap = TypedYMap.create(
        require("../schemas-effect").MaskingShapeSchema,
        shapeYMap
      );
      
      shapes.push(
        new MaskingShape(
          shapeTypedYMap,
          this.executeUndoable,
          this.useGranularPath
        )
      );
    }
    
    return shapes;
  }

  getShapeById(frameId: string, shapeId: string): IMaskingShape | undefined {
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

    const frameRecord = this.typedYMap.getFromRecord("framesToShapesMap", frameId);
    if (!frameRecord) {
      return false;
    }

    // Check if frame record has any entries
    // TODO: Add size() or isEmpty() method to TypedYMap for top-level Records
    const rawFrameRecord = (frameRecord as any).getRawYMap();
    return rawFrameRecord.size > 0;
  }

  getTotalShapeCount(): number {
    let count = 0;
    
    // Iterate over all frame IDs using new method
    const frameIds = this.typedYMap.getRecordKeys("framesToShapesMap");
    
    for (const frameId of frameIds) {
      const frameRecord = this.typedYMap.getFromRecord("framesToShapesMap", frameId);
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

  clone(): IMaskingLayer {
    const newLayer = new MaskingLayer(
      {
        id: crypto.randomUUID(),
        name: this.name,
        visible: this.visible,
        order: this.order,
        color: this.color,
        metadata: this.metadata ? JSON.parse(JSON.stringify(this.metadata)) : undefined,
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
  getTypedYMap(): TypedYMap<typeof MaskingLayerSchema> {
    return this.typedYMap;
  }
}