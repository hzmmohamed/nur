/**
 * Refactored AnimationFrame Implementation
 * 
 * Changes from original:
 * 1. Constructor accepts TypedYMap OR data (no raw Y.Map)
 * 2. Removed .ymap getter - no Y.Map exposure
 * 3. Added getTypedYMap() for parent classes
 * 4. All operations through TypedYMap (already was mostly this way)
 * 
 * This class is mostly a thin wrapper around TypedYMap with property
 * delegation and undo tracking.
 */

import * as Y from "yjs";
import type { IAnimationFrame } from "../interfaces";
import { TypedYMap } from "@/lib/yjs-utils/typed-wrappers/impl-composition-recursive";
import { AnimationFrameSchema } from "../schemas-effect";
import type { Schema as S } from "effect";

type ExecuteUndoableOperation = (operation: () => void) => void;

export class AnimationFrame implements IAnimationFrame {
  private typedYMap: TypedYMap<typeof AnimationFrameSchema>;

  constructor(
    typedYMapOrData: TypedYMap<typeof AnimationFrameSchema> | S.Schema.Encoded<typeof AnimationFrameSchema>,
    private executeUndoable?: ExecuteUndoableOperation
  ) {
    if (typedYMapOrData instanceof TypedYMap) {
      // Wrapping existing TypedYMap
      this.typedYMap = typedYMapOrData;
    } else {
      // Creating new from data - TypedYMap creates Y.Map internally
      const ymap = new Y.Map();
      this.typedYMap = TypedYMap.create(AnimationFrameSchema, ymap, typedYMapOrData);
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
  // IAnimationFrame Implementation
  // =========================================================================

  // Identifiable
  get id(): string {
    return this.typedYMap.get("id")!;
  }

  // Frame properties
  get index(): number {
    return this.typedYMap.get("index")!;
  }

  set index(value: number) {
    this.execute(() => {
      this.typedYMap.set("index", value);
    });
  }

  get timestamp(): number {
    return this.typedYMap.get("timestamp")!;
  }

  set timestamp(value: number) {
    this.execute(() => {
      this.typedYMap.set("timestamp", value);
    });
  }

  get duration(): number | undefined {
    return this.typedYMap.get("duration");
  }

  set duration(value: number | undefined) {
    this.execute(() => {
      if (value === undefined) {
        this.typedYMap.delete("duration");
      } else {
        this.typedYMap.set("duration", value);
      }
    });
  }

  get thumbnailUrl(): string | undefined {
    return this.typedYMap.get("thumbnailUrl");
  }

  set thumbnailUrl(value: string | undefined) {
    this.execute(() => {
      if (value === undefined) {
        this.typedYMap.delete("thumbnailUrl");
      } else {
        this.typedYMap.set("thumbnailUrl", value);
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

  // Ordered
  get order(): number {
    return this.typedYMap.get("order") || 0;
  }

  set order(value: number) {
    this.execute(() => {
      this.typedYMap.set("order", value);
    });
  }

  // =========================================================================
  // Cloning
  // =========================================================================

  clone(): IAnimationFrame {
    const newFrame = new AnimationFrame(
      {
        id: crypto.randomUUID(),
        index: this.index,
        timestamp: this.timestamp,
        duration: this.duration,
        thumbnailUrl: this.thumbnailUrl,
        metadata: this.metadata ? JSON.parse(JSON.stringify(this.metadata)) : undefined,
        order: this.order,
      },
      this.executeUndoable
    );

    return newFrame;
  }

  // =========================================================================
  // Internal accessor for parent classes (AnimationProject)
  // Returns TypedYMap, NOT raw Y.Map
  // =========================================================================
  
  /** @internal - Only for use by parent entity classes */
  getTypedYMap(): TypedYMap<typeof AnimationFrameSchema> {
    return this.typedYMap;
  }
}