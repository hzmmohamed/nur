
// ============================================================================
// 2. MaskingShape Implementation
// ============================================================================

import * as Y from "yjs";
import type { IMaskingShape, IClosedCubicBezierPath } from "../interfaces";
import type { Bounds } from "../coordinate-utils";
import type { ExecuteUndoableOperation } from "./types";
import { TypedYMap } from "@/lib/yjs-utils/typed-wrappers/impl-composition-recursive";
import { MaskingShapeSchema, type MaskingShapeInputData } from "../schemas-effect";
import {
  ClosedCubicBezierPathAtomic,
  ClosedCubicBezierPathGranular,
} from "./cubic-bezier-path";

export class MaskingShape implements IMaskingShape {
  private path: IClosedCubicBezierPath;
  private typedYMap: TypedYMap<typeof MaskingShapeSchema>;

  constructor(
    dataOrYmap: MaskingShapeInputData | Y.Map<any>,
    private executeUndoable?: ExecuteUndoableOperation,
    private useGranularPath: boolean = false
  ) {
    // Check if it's a YMap or data object
    if (dataOrYmap instanceof Y.Map) {
      // Wrapping existing YMap
      this.typedYMap = TypedYMap.create(MaskingShapeSchema, dataOrYmap);
    } else {
      // Creating new instance from data
      const ymap = new Y.Map();
      this.typedYMap = TypedYMap.create(MaskingShapeSchema, ymap, dataOrYmap);
    }

    // Get the nested pathData map (TypedYMap handles the creation internally)
    const pathDataNested = this.typedYMap.getNestedMap("pathData")!;
    const pathYmap = pathDataNested.getRawYMap();

    // Create the appropriate path implementation
    if (useGranularPath) {
      this.path = new ClosedCubicBezierPathGranular(pathYmap, executeUndoable);
    } else {
      this.path = new ClosedCubicBezierPathAtomic(pathYmap, executeUndoable);
    }
  }

  // Identifiable
  get id(): string {
    return this.typedYMap.get("id")!;
  }

  // Frame association (immutable)
  get frameId(): string {
    return this.typedYMap.get("frameId")!;
  }

  // Path Access
  getPath(): IClosedCubicBezierPath {
    return this.path;
  }

  // Computed Properties
  getBounds(): Bounds {
    return this.path.getBounds();
  }

  // Cloning
  clone(): IMaskingShape {
    const newShape = new MaskingShape(
      {
        id: crypto.randomUUID(),
        frameId: this.frameId,
        pathData: {
          points: this.path.getAllPoints(),
          closed: true,
        },
      },
      this.executeUndoable,
      this.useGranularPath
    );

    return newShape;
  }

  // Internal: Get underlying Y.Map for other classes to access
  get ymap(): Y.Map<any> {
    return this.typedYMap.getRawYMap();
  }
}
