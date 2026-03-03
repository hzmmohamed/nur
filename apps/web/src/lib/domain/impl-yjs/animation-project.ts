/**
 * Refactored AnimationProject Implementation
 *
 * Changes from original:
 * 1. Removed .ymap getter - no Y.Map exposure to external code
 * 2. Uses TypedYMap collection methods where available
 * 3. Collection access patterns follow MaskingLayer/LightingLayer
 * 4. Transaction and undo/redo logic preserved
 *
 * Note: This class creates its own Y.Doc and TypedYMap (root entity)
 * So constructor doesn't accept TypedYMap like child entities
 */

import * as Y from "yjs";
import { TypedYMap } from "@/lib/yjs-utils/typed-wrappers/impl-composition-recursive";
import {
  AnimationProjectSchema,
  type AnimationProjectInputData,
} from "../schemas-effect";
import type {
  IAnimationFrame,
  IMaskingLayer,
  ILightingLayer,
  IAnimationProject,
  TransactionMetadata,
  UndoRedoState,
} from "../interfaces";
import { AnimationFrame } from "./animation-frame";
import { MaskingLayer } from "./masking-layer";
import { LightingLayer } from "./lighting-layer";

type ExecuteUndoableOperation = (operation: () => void) => void;

export class AnimationProject implements IAnimationProject {
  private typedYMap: TypedYMap<typeof AnimationProjectSchema>;
  public readonly ydoc: Y.Doc;
  private executeUndoable: ExecuteUndoableOperation;
  private undoManager: Y.UndoManager;

  // Transaction state
  private inTransaction = false;
  private currentTransactionOpsCount = 0;
  private currentTransactionMetadata?: Partial<TransactionMetadata>;

  // Transaction history
  private transactionHistory: TransactionMetadata[] = [];
  private transactionHistoryIndex = 0;

  // Undo/redo callbacks
  private undoRedoCallbacks: Set<(state: UndoRedoState) => void> = new Set();

  constructor(
    data: AnimationProjectInputData,
    private useGranularPath: boolean = false
  ) {
    // Create new YDoc for this project
    this.ydoc = new Y.Doc();
    const rootMap = this.ydoc.getMap("project");

    // Initialize undo manager with captureTimeout disabled
    this.undoManager = new Y.UndoManager(this.ydoc, {
      captureTimeout: 0, // Disable auto-grouping
    });

    // Define the execute operation for this project's YDoc
    this.executeUndoable = (operation: () => void) => {
      this.ydoc.transact(() => {
        operation();
      });

      // Count the operation
      if (this.inTransaction) {
        this.currentTransactionOpsCount++;
      } else {
        // Auto-wrap in single-operation transaction
        const metadata: TransactionMetadata = {
          description: "Single operation",
          type: "auto",
          timestamp: Date.now(),
          operationCount: 1,
        };

        this.transactionHistory = this.transactionHistory.slice(
          0,
          this.transactionHistoryIndex
        );
        this.transactionHistory.push(metadata);
        this.transactionHistoryIndex++;
        this.notifyUndoRedoChange();
      }
    };

    // Create TypedYMap with initial data
    this.typedYMap = TypedYMap.create(AnimationProjectSchema, rootMap, data);
  }

  private execute(operation: () => void): void {
    this.executeUndoable(operation);
  }

  private notifyUndoRedoChange(): void {
    const state = this.getUndoRedoState();
    this.undoRedoCallbacks.forEach((callback) => callback(state));
  }

  // =========================================================================
  // IAnimationProject Implementation
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

  // Project properties
  get frameRate(): number {
    return this.typedYMap.get("frameRate")!;
  }

  set frameRate(value: number) {
    this.execute(() => {
      this.typedYMap.set("frameRate", value);
    });
  }

  get width(): number {
    return this.typedYMap.get("width")!;
  }

  set width(value: number) {
    this.execute(() => {
      this.typedYMap.set("width", value);
    });
  }

  get height(): number {
    return this.typedYMap.get("height")!;
  }

  set height(value: number) {
    this.execute(() => {
      this.typedYMap.set("height", value);
    });
  }

  // =========================================================================
  // Frame Management
  // =========================================================================

  createFrame(
    index: number,
    timestamp: number,
    options?: Partial<IAnimationFrame>
  ): IAnimationFrame {
    let frame: IAnimationFrame;

    this.execute(() => {
      const frameData = {
        id: crypto.randomUUID(),
        index,
        timestamp,
        duration: options?.duration,
        thumbnailUrl: options?.thumbnailUrl,
        metadata: options?.metadata,
        order: options?.order ?? index,
      };

      frame = new AnimationFrame(frameData, this.executeUndoable);

      // Add to framesMap using TypedYMap
      const frameTypedYMap = (frame as any).getTypedYMap();
      const frameRawYMap = frameTypedYMap.getRawYMap();

      // TODO: Add setInRecord() method to TypedYMap to avoid getRawYMap()
      const framesMap = this.typedYMap.getRawYMap().get("framesMap");
      framesMap.set(frame!.id, frameRawYMap);
    });

    return frame!;
  }

  addFrame(frame: IAnimationFrame): void {
    this.execute(() => {
      const frameTypedYMap = (frame as any).getTypedYMap();
      const frameRawYMap = frameTypedYMap.getRawYMap();

      // TODO: Add setInRecord() method to TypedYMap to avoid getRawYMap()
      const framesMap = this.typedYMap.getRawYMap().get("framesMap");
      framesMap.set(frame.id, frameRawYMap);
    });
  }

  removeFrame(frameId: string): boolean {
    let success = false;

    this.execute(() => {
      // Check if frame exists using new method
      if (!this.typedYMap.hasRecordKey("framesMap", frameId)) {
        success = false;
        return;
      }

      // TODO: Add deleteFromRecord() method to TypedYMap to avoid getRawYMap()
      const framesMap = this.typedYMap.getRawYMap().get("framesMap");
      framesMap.delete(frameId);
      success = true;
    });

    return success;
  }

  getFrameByIndex(index: number): IAnimationFrame | undefined {
    const frames = this.getAllFrames();
    return frames.find((frame) => frame.index === index);
  }

  getFrameById(id: string): IAnimationFrame | undefined {
    // Check if frame exists using new method
    if (!this.typedYMap.hasRecordKey("framesMap", id)) {
      return undefined;
    }

    const frameRecord = this.typedYMap.getFromRecord("framesMap", id);
    if (!frameRecord) {
      return undefined;
    }

    return new AnimationFrame(frameRecord, this.executeUndoable);
  }

  getAllFrames(): IAnimationFrame[] {
    const frames: IAnimationFrame[] = [];

    // Use new iterateRecord method
    for (const [frameId, frameTypedYMap] of this.typedYMap.iterateRecord(
      "framesMap"
    )) {
      frames.push(new AnimationFrame(frameTypedYMap, this.executeUndoable));
    }

    return frames;
  }

  getFramesSortedByIndex(): IAnimationFrame[] {
    const frames = this.getAllFrames();
    return frames.sort((a, b) => a.index - b.index);
  }

  getTotalDuration(): number {
    const frames = this.getFramesSortedByIndex();
    if (frames.length === 0) return 0;

    // If frames have explicit durations, sum them
    const hasExplicitDurations = frames.some((f) => f.duration !== undefined);
    if (hasExplicitDurations) {
      return frames.reduce((sum, frame) => {
        return sum + (frame.duration ?? 0);
      }, 0);
    }

    // Otherwise calculate from timestamps and frame rate
    const lastFrame = frames[frames.length - 1];
    const frameDuration = 1000 / this.frameRate; // ms per frame
    return lastFrame.timestamp + frameDuration;
  }

  // =========================================================================
  // Masking Layer Management
  // =========================================================================

  createMaskingLayer(
    name: string,
    options?: Partial<IMaskingLayer>
  ): IMaskingLayer {
    let layer: IMaskingLayer;

    this.execute(() => {
      const layerData = {
        id: crypto.randomUUID(),
        name,
        visible: options?.visible ?? true,
        order: options?.order ?? 0,
        color: options?.color,
        metadata: options?.metadata,
        framesToShapesMap: {},
      };

      layer = new MaskingLayer(
        layerData,
        this.executeUndoable,
        this.useGranularPath
      );

      // Add to maskingLayersMap
      const layerTypedYMap = (layer as any).getTypedYMap();
      const layerRawYMap = layerTypedYMap.getRawYMap();

      // TODO: Add setInRecord() method to TypedYMap to avoid getRawYMap()
      const maskingLayersMap = this.typedYMap
        .getRawYMap()
        .get("maskingLayersMap");
      maskingLayersMap.set(layer!.id, layerRawYMap);
    });

    return layer!;
  }

  addMaskingLayer(layer: IMaskingLayer): void {
    this.execute(() => {
      const layerTypedYMap = (layer as any).getTypedYMap();
      const layerRawYMap = layerTypedYMap.getRawYMap();

      // TODO: Add setInRecord() method to TypedYMap to avoid getRawYMap()
      const maskingLayersMap = this.typedYMap
        .getRawYMap()
        .get("maskingLayersMap");
      maskingLayersMap.set(layer.id, layerRawYMap);
    });
  }

  removeMaskingLayer(layerId: string): boolean {
    let success = false;

    this.execute(() => {
      // Check if layer exists using new method
      if (!this.typedYMap.hasRecordKey("maskingLayersMap", layerId)) {
        success = false;
        return;
      }

      // TODO: Add deleteFromRecord() method to TypedYMap to avoid getRawYMap()
      const maskingLayersMap = this.typedYMap
        .getRawYMap()
        .get("maskingLayersMap");
      maskingLayersMap.delete(layerId);
      success = true;
    });

    return success;
  }

  getMaskingLayerById(id: string): IMaskingLayer | undefined {
    // Check if layer exists using new method
    if (!this.typedYMap.hasRecordKey("maskingLayersMap", id)) {
      return undefined;
    }

    const layerRecord = this.typedYMap.getFromRecord("maskingLayersMap", id);
    if (!layerRecord) {
      return undefined;
    }

    return new MaskingLayer(
      layerRecord,
      this.executeUndoable,
      this.useGranularPath
    );
  }

  getAllMaskingLayers(): IMaskingLayer[] {
    const layers: IMaskingLayer[] = [];

    // Use new iterateRecord method
    for (const [layerId, layerTypedYMap] of this.typedYMap.iterateRecord(
      "maskingLayersMap"
    )) {
      layers.push(
        new MaskingLayer(
          layerTypedYMap,
          this.executeUndoable,
          this.useGranularPath
        )
      );
    }

    return layers;
  }

  getVisibleMaskingLayers(): IMaskingLayer[] {
    const layers = this.getAllMaskingLayers();
    return layers
      .filter((layer) => layer.visible)
      .sort((a, b) => a.order - b.order);
  }

  // =========================================================================
  // Lighting Layer Management
  // =========================================================================

  createLightingLayer(
    maskingLayerId: string,
    name: string,
    options?: Partial<ILightingLayer>
  ): ILightingLayer {
    let layer: ILightingLayer;

    this.execute(() => {
      const layerData = {
        id: crypto.randomUUID(),
        maskingLayerId,
        name,
        visible: options?.visible ?? true,
        order: options?.order ?? 0,
        blendMode: options?.blendMode ?? "normal",
        opacity: options?.opacity ?? 1.0,
        metadata: options?.metadata,
        framesToShapesMap: {},
      };

      layer = new LightingLayer(
        layerData,
        this.executeUndoable,
        this.useGranularPath
      );

      // Add to lightingLayersMap
      const layerTypedYMap = (layer as any).getTypedYMap();
      const layerRawYMap = layerTypedYMap.getRawYMap();

      // TODO: Add setInRecord() method to TypedYMap to avoid getRawYMap()
      const lightingLayersMap = this.typedYMap
        .getRawYMap()
        .get("lightingLayersMap");
      lightingLayersMap.set(layer!.id, layerRawYMap);
    });

    return layer!;
  }

  addLightingLayer(layer: ILightingLayer): void {
    this.execute(() => {
      const layerTypedYMap = (layer as any).getTypedYMap();
      const layerRawYMap = layerTypedYMap.getRawYMap();

      // TODO: Add setInRecord() method to TypedYMap to avoid getRawYMap()
      const lightingLayersMap = this.typedYMap
        .getRawYMap()
        .get("lightingLayersMap");
      lightingLayersMap.set(layer.id, layerRawYMap);
    });
  }

  removeLightingLayer(layerId: string): boolean {
    let success = false;

    this.execute(() => {
      // Check if layer exists using new method
      if (!this.typedYMap.hasRecordKey("lightingLayersMap", layerId)) {
        success = false;
        return;
      }

      // TODO: Add deleteFromRecord() method to TypedYMap to avoid getRawYMap()
      const lightingLayersMap = this.typedYMap
        .getRawYMap()
        .get("lightingLayersMap");
      lightingLayersMap.delete(layerId);
      success = true;
    });

    return success;
  }

  getLightingLayerById(id: string): ILightingLayer | undefined {
    // Check if layer exists using new method
    if (!this.typedYMap.hasRecordKey("lightingLayersMap", id)) {
      return undefined;
    }

    const layerRecord = this.typedYMap.getFromRecord("lightingLayersMap", id);
    if (!layerRecord) {
      return undefined;
    }

    return new LightingLayer(
      layerRecord,
      this.executeUndoable,
      this.useGranularPath
    );
  }

  getAllLightingLayers(): ILightingLayer[] {
    const layers: ILightingLayer[] = [];

    // Use new iterateRecord method
    for (const [layerId, layerTypedYMap] of this.typedYMap.iterateRecord(
      "lightingLayersMap"
    )) {
      layers.push(
        new LightingLayer(
          layerTypedYMap,
          this.executeUndoable,
          this.useGranularPath
        )
      );
    }

    return layers;
  }

  getLightingLayersForMask(maskingLayerId: string): ILightingLayer[] {
    const layers = this.getAllLightingLayers();
    return layers
      .filter((layer) => layer.maskingLayerId === maskingLayerId)
      .sort((a, b) => a.order - b.order);
  }

  getVisibleLightingLayersForMask(maskingLayerId: string): ILightingLayer[] {
    const layers = this.getLightingLayersForMask(maskingLayerId);
    return layers.filter((layer) => layer.visible);
  }

  // =========================================================================
  // Transaction Control
  // =========================================================================

  beginTransaction(
    description: string,
    metadata?: Partial<TransactionMetadata>
  ): void {
    if (this.inTransaction) {
      throw new Error(
        "Nested transactions not supported. Commit or rollback the current transaction first."
      );
    }

    this.inTransaction = true;
    this.currentTransactionOpsCount = 0;
    this.currentTransactionMetadata = {
      description,
      type: metadata?.type || "transaction",
      timestamp: Date.now(),
      targetId: metadata?.targetId,
      targetName: metadata?.targetName,
    };
  }

  commitTransaction(): void {
    if (!this.inTransaction) {
      throw new Error("No transaction to commit");
    }

    if (this.currentTransactionOpsCount > 0) {
      const transaction: TransactionMetadata = {
        ...this.currentTransactionMetadata!,
        operationCount: this.currentTransactionOpsCount,
      };

      this.transactionHistory = this.transactionHistory.slice(
        0,
        this.transactionHistoryIndex
      );
      this.transactionHistory.push(transaction);
      this.transactionHistoryIndex++;
      this.notifyUndoRedoChange();
    }

    this.inTransaction = false;
    this.currentTransactionOpsCount = 0;
    this.currentTransactionMetadata = undefined;
  }

  rollbackTransaction(): void {
    if (!this.inTransaction) {
      throw new Error("No transaction to rollback");
    }

    // Undo all operations in current transaction
    for (let i = 0; i < this.currentTransactionOpsCount; i++) {
      this.undoManager.undo();
    }

    this.inTransaction = false;
    this.currentTransactionOpsCount = 0;
    this.currentTransactionMetadata = undefined;
  }

  isInTransaction(): boolean {
    return this.inTransaction;
  }

  // =========================================================================
  // Undo/Redo
  // =========================================================================

  undo(): void {
    if (!this.canUndo()) return;

    const transaction =
      this.transactionHistory[this.transactionHistoryIndex - 1];

    // Undo all operations in that transaction
    for (let i = 0; i < transaction.operationCount; i++) {
      this.undoManager.undo();
    }

    this.transactionHistoryIndex--;
    this.notifyUndoRedoChange();
  }

  redo(): void {
    if (!this.canRedo()) return;

    const transaction = this.transactionHistory[this.transactionHistoryIndex];

    // Redo all operations in that transaction
    for (let i = 0; i < transaction.operationCount; i++) {
      this.undoManager.redo();
    }

    this.transactionHistoryIndex++;
    this.notifyUndoRedoChange();
  }

  canUndo(): boolean {
    return this.transactionHistoryIndex > 0;
  }

  canRedo(): boolean {
    return this.transactionHistoryIndex < this.transactionHistory.length;
  }

  getUndoRedoState(): UndoRedoState {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoStackSize: this.transactionHistoryIndex,
      redoStackSize:
        this.transactionHistory.length - this.transactionHistoryIndex,
      lastOperation: this.transactionHistory[this.transactionHistoryIndex - 1],
    };
  }

  onUndoRedoStateChange(callback: (state: UndoRedoState) => void): () => void {
    this.undoRedoCallbacks.add(callback);

    // Call immediately with current state
    callback(this.getUndoRedoState());

    return () => {
      this.undoRedoCallbacks.delete(callback);
    };
  }

  clearUndoHistory(): void {
    this.undoManager.clear();
    this.transactionHistory = [];
    this.transactionHistoryIndex = 0;
    this.notifyUndoRedoChange();
  }

  getTransactionHistory(): TransactionMetadata[] {
    return this.transactionHistory.slice(0, this.transactionHistoryIndex);
  }

  // =========================================================================
  // Note: No .ymap getter - Y.Map not exposed externally
  // AnimationProject is the root entity and manages its own Y.Doc
  // =========================================================================
}
