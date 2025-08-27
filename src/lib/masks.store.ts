import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { UndoManager } from "yjs";

/**
 * Vector Document using Yjs for collaborative editing with IndexedDB persistence
 *
 * Structure:
 * Document
 * ├── layers (Y.Array)
 * │   └── layer (Y.Map)
 * │       ├── id: string
 * │       ├── name: string
 * │       ├── visible: boolean
 * │       └── curves (Y.Array)
 * │           └── curve (Y.Array of bezier points)
 * │               └── bezierPoint (Y.Map)
 * │                   ├── anchor (Y.Map) { x: number, y: number }
 * │                   ├── control1 (Y.Map) { x: number, y: number }
 * │                   ├── control2 (Y.Map) { x: number, y: number }
 * │                   └── type: string
 */

// Type definitions
interface Point {
  x: number;
  y: number;
}

interface BezierPointData {
  anchor: Point;
  control1: Point;
  control2: Point;
  type: BezierPointType;
}

interface LayerData {
  id: string;
  name: string;
  visible: boolean;
  curves: BezierPointData[][];
}

interface VectorDocumentData {
  layers: LayerData[];
}

interface VectorDocumentOptions {
  autoSave?: boolean;
  saveDebounceMs?: number;
  enableUndo?: boolean;
  undoStackSize?: number;
  captureTimeout?: number;
}

interface StorageInfo {
  usage: number;
  quota: number;
  usageInMB: number;
  quotaInMB: number;
}

interface BackupInfo {
  name: string;
  timestamp: number;
  data: VectorDocumentData;
}

interface UndoRedoState {
  canUndo: boolean;
  canRedo: boolean;
  undoStackSize: number;
  redoStackSize: number;
}

interface UndoRedoEvent {
  type: "undo" | "redo";
  stackItem: any;
  changedParentTypes: Map<Y.AbstractType<any>, Y.YEvent<any>[]>;
}

type BezierPointType = "smooth" | "corner" | "symmetric" | "disconnected";

type LayerUpdates = Partial<Omit<LayerData, "id" | "curves">>;

interface BackupListItem {
  name: string;
  fullName: string;
}

type BezierPointUpdates = Partial<BezierPointData>;

type UndoRedoCallback = (event: UndoRedoEvent) => void;

// Y.js type extensions
type YLayer = Y.Map<any>;
type YCurve = Y.Array<Y.Map<any>>;
type YBezierPoint = Y.Map<any>;
type YPoint = Y.Map<number>;

class VectorDocument {
  public readonly doc: Y.Doc;
  public readonly layers: Y.Array<YLayer>;
  public readonly documentName: string;
  private readonly persistence: IndexeddbPersistence;
  private readonly options: Required<VectorDocumentOptions>;
  private readonly undoManager?: UndoManager;
  private isReady: boolean = false;
  private readonly readyPromise: Promise<void>;
  private undoRedoCallbacks: Set<UndoRedoCallback> = new Set();

  constructor(
    documentName: string = "vector-document",
    options: VectorDocumentOptions = {}
  ) {
    this.doc = new Y.Doc();
    this.layers = this.doc.getArray<YLayer>("layers");
    this.documentName = documentName;

    // Initialize IndexedDB persistence
    this.persistence = new IndexeddbPersistence(documentName, this.doc);

    // Configuration options
    this.options = {
      autoSave: true,
      saveDebounceMs: 1000,
      enableUndo: false,
      undoStackSize: 100,
      captureTimeout: 500,
      ...options,
    };

    // Initialize UndoManager if enabled
    if (this.options.enableUndo) {
      this.undoManager = new UndoManager([this.layers], {
        trackedOrigins: new Set([this.doc.clientID]),
        captureTimeout: this.options.captureTimeout,
      });
      this.setupUndoManager();
    }

    // Setup auto-save if enabled
    if (this.options.autoSave) {
      this.setupAutoSave();
    }

    // Track if document is ready
    this.readyPromise = this.waitForReady();
  }

  private async waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      this.persistence.on("synced", () => {
        this.isReady = true;
        resolve();
      });
    });
  }

  private setupUndoManager(): void {
    if (!this.undoManager) return;

    // Listen to undo/redo events
    this.undoManager.on("stack-item-added", (event: any) => {
      this.notifyUndoRedoCallbacks({
        type: event.type || "undo",
        stackItem: event.stackItem,
        changedParentTypes: event.changedParentTypes || new Map(),
      });
    });

    this.undoManager.on("stack-item-popped", (event: any) => {
      this.notifyUndoRedoCallbacks({
        type: event.type || "redo",
        stackItem: event.stackItem,
        changedParentTypes: event.changedParentTypes || new Map(),
      });
    });
  }

  private setupAutoSave(): void {
    let saveTimeout: NodeJS.Timeout | undefined;

    this.doc.on("update", () => {
      if (saveTimeout) clearTimeout(saveTimeout);

      saveTimeout = setTimeout(() => {
        this.save().catch(console.error);
      }, this.options.saveDebounceMs);
    });
  }

  // Undo/Redo Methods
  undo(): boolean {
    if (!this.undoManager) {
      console.warn("UndoManager is not enabled");
      return false;
    }

    if (this.undoManager.canUndo()) {
      this.undoManager.undo();
      return true;
    }
    return false;
  }

  redo(): boolean {
    if (!this.undoManager) {
      console.warn("UndoManager is not enabled");
      return false;
    }

    if (this.undoManager.canRedo()) {
      this.undoManager.redo();
      return true;
    }
    return false;
  }

  canUndo(): boolean {
    return this.undoManager?.canUndo() || false;
  }

  canRedo(): boolean {
    return this.undoManager?.canRedo() || false;
  }

  getUndoRedoState(): UndoRedoState {
    if (!this.undoManager) {
      return {
        canUndo: false,
        canRedo: false,
        undoStackSize: 0,
        redoStackSize: 0,
      };
    }

    return {
      canUndo: this.undoManager.canUndo(),
      canRedo: this.undoManager.canRedo(),
      undoStackSize: this.undoManager.undoStack.length,
      redoStackSize: this.undoManager.redoStack.length,
    };
  }

  clearUndoRedoHistory(): void {
    if (this.undoManager) {
      this.undoManager.clear();
    }
  }

  stopCapturing(): void {
    if (this.undoManager) {
      this.undoManager.stopCapturing();
    }
  }

  onUndoRedo(callback: UndoRedoCallback): () => void {
    this.undoRedoCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.undoRedoCallbacks.delete(callback);
    };
  }

  // Transaction Methods for Batching Operations
  withTransaction<T>(fn: () => T, origin?: any): T {
    return this.doc.transact(fn, origin || this.doc.clientID);
  }

  withUndoGroup<T>(fn: () => T): T {
    if (!this.undoManager) {
      return fn();
    }

    // Stop capturing to create a single undo group
    this.undoManager.stopCapturing();

    try {
      return this.withTransaction(fn);
    } finally {
      // Resume capturing after the transaction
      setTimeout(() => {
        if (this.undoManager) {
          this.undoManager.stopCapturing();
        }
      }, 0);
    }
  }

  // Persistence Methods
  async save(): Promise<boolean> {
    try {
      // Force persistence to save current state
      await this.persistence.set("manual-save", Date.now());
      return true;
    } catch (error) {
      console.error("Failed to save document:", error);
      return false;
    }
  }

  async load(): Promise<boolean> {
    try {
      await this.readyPromise;
      return true;
    } catch (error) {
      console.error("Failed to load document:", error);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      // Clear the document
      this.layers.delete(0, this.layers.length);

      // Clear IndexedDB
      await this.persistence.clearData();
      return true;
    } catch (error) {
      console.error("Failed to clear document:", error);
      return false;
    }
  }

  async getStorageSize(): Promise<StorageInfo | null> {
    try {
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;

        return {
          usage,
          quota,
          usageInMB: Math.round((usage / 1024 / 1024) * 100) / 100,
          quotaInMB: Math.round((quota / 1024 / 1024) * 100) / 100,
        };
      }
      return null;
    } catch (error) {
      console.error("Failed to get storage estimate:", error);
      return null;
    }
  }

  // Layer Management (with undo support)
  createLayer(name: string = "New Layer", visible: boolean = true): string {
    return this.withTransaction(() => {
      const layer = new Y.Map<any>();
      // TODO:
      // const layerId = this.generateId();
      const layerId = name;

      layer.set("id", layerId);
      layer.set("name", name);
      layer.set("visible", visible);
      layer.set("curves", new Y.Array<YCurve>());

      this.layers.push([layer]);

      // Add the new layer's curves to undo manager tracking
      if (this.undoManager) {
        const curves = layer.get("curves") as Y.Array<YCurve>;
        this.undoManager.addToScope(curves);
      }

      return layerId;
    });
  }

  removeLayer(layerId: string): void {
    this.withTransaction(() => {
      const layerIndex = this.layers
        .toArray()
        .findIndex((layer: YLayer) => layer.get("id") === layerId);
      if (layerIndex !== -1) {
        this.layers.delete(layerIndex, 1);
      }
    });
  }

  updateLayer(layerId: string, updates: LayerUpdates): void {
    this.withTransaction(() => {
      const layer = this.getLayer(layerId);
      if (layer) {
        Object.entries(updates).forEach(([key, value]) => {
          if (key !== "curves" && key !== "id") {
            // Protect curves and id from direct updates
            layer.set(key, value);
          }
        });
      }
    });
  }

  getLayer(layerId: string): YLayer | undefined {
    return this.layers
      .toArray()
      .find((layer: YLayer) => layer.get("id") === layerId);
  }

  // Curve Management (with undo support)
  createCurve(
    layerId: string,
    bezierPoints: BezierPointData[] = []
  ): number | null {
    return this.withTransaction(() => {
      const layer = this.getLayer(layerId);
      if (!layer) return null;

      const curves = layer.get("curves") as Y.Array<YCurve>;
      const curve = new Y.Array<YBezierPoint>();

      // Add bezier points to the curve
      bezierPoints.forEach((point) => {
        curve.push([this.createBezierPoint(point)]);
      });

      curves.push([curve]);

      // Add the new curve to undo manager tracking
      if (this.undoManager) {
        this.undoManager.addToScope(curve);
      }

      return curves.length - 1; // Return curve index
    });
  }

  removeCurve(layerId: string, curveIndex: number): void {
    this.withTransaction(() => {
      const layer = this.getLayer(layerId);
      if (!layer) return;

      const curves = layer.get("curves") as Y.Array<YCurve>;
      if (curveIndex < curves.length) {
        curves.delete(curveIndex, 1);
      }
    });
  }

  getCurve(layerId: string, curveIndex: number): YCurve | null {
    const layer = this.getLayer(layerId);
    if (!layer) return null;

    const curves = layer.get("curves") as Y.Array<YCurve>;
    if (curveIndex >= curves.length) return null;

    return curves.get(curveIndex);
  }

  // Bezier Point Management (with undo support)
  createBezierPoint(pointData: Partial<BezierPointData>): YBezierPoint {
    const { anchor, control1, control2, type = "smooth" } = pointData;

    const bezierPoint = new Y.Map<any>();

    const anchorPoint = new Y.Map<number>();
    anchorPoint.set("x", anchor?.x || 0);
    anchorPoint.set("y", anchor?.y || 0);

    const control1Point = new Y.Map<number>();
    control1Point.set("x", control1?.x || anchor?.x);
    control1Point.set("y", control1?.y || anchor?.y);

    const control2Point = new Y.Map<number>();
    control2Point.set("x", control2?.x || anchor?.x);
    control2Point.set("y", control2?.y || anchor?.y);

    bezierPoint.set("anchor", anchorPoint);
    bezierPoint.set("control1", control1Point);
    bezierPoint.set("control2", control2Point);
    bezierPoint.set("type", type);

    return bezierPoint;
  }

  addBezierPoint(
    layerId: string,
    curveIndex: number,
    pointData: Partial<BezierPointData>,
    insertIndex: number = -1
  ): void {
    this.withTransaction(() => {
      const curve = this.getCurve(layerId, curveIndex);
      if (!curve) return;

      const bezierPoint = this.createBezierPoint(pointData);

      if (insertIndex === -1) {
        curve.push([bezierPoint]);
      } else {
        curve.insert(insertIndex, [bezierPoint]);
      }
    });
  }

  updateBezierPoint(
    layerId: string,
    curveIndex: number,
    pointIndex: number,
    updates: BezierPointUpdates
  ): void {
    this.withTransaction(() => {
      const curve = this.getCurve(layerId, curveIndex);
      if (!curve || pointIndex >= curve.length) return;

      const bezierPoint = curve.get(pointIndex) as YBezierPoint;

      // Update anchor point
      if (updates.anchor) {
        const anchor = bezierPoint.get("anchor") as YPoint;
        if (updates.anchor.x !== undefined) anchor.set("x", updates.anchor.x);
        if (updates.anchor.y !== undefined) anchor.set("y", updates.anchor.y);
      }

      // Update control1 point
      if (updates.control1) {
        const control1 = bezierPoint.get("control1") as YPoint;
        if (updates.control1.x !== undefined)
          control1.set("x", updates.control1.x);
        if (updates.control1.y !== undefined)
          control1.set("y", updates.control1.y);
      }

      // Update control2 point
      if (updates.control2) {
        const control2 = bezierPoint.get("control2") as YPoint;
        if (updates.control2.x !== undefined)
          control2.set("x", updates.control2.x);
        if (updates.control2.y !== undefined)
          control2.set("y", updates.control2.y);
      }

      // Update type
      if (updates.type !== undefined) {
        bezierPoint.set("type", updates.type);
      }
    });
  }

  removeBezierPoint(
    layerId: string,
    curveIndex: number,
    pointIndex: number
  ): void {
    this.withTransaction(() => {
      const curve = this.getCurve(layerId, curveIndex);
      if (!curve || pointIndex >= curve.length) return;

      curve.delete(pointIndex, 1);
    });
  }

  // Utility Methods
  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Export/Import
  toJSON(): VectorDocumentData {
    return {
      layers: this.layers.toArray().map(
        (layer: YLayer): LayerData => ({
          id: layer.get("id") as string,
          name: layer.get("name") as string,
          visible: layer.get("visible") as boolean,
          curves: (layer.get("curves") as Y.Array<YCurve>)
            .toArray()
            .map((curve: YCurve) =>
              curve.toArray().map((point: YBezierPoint): BezierPointData => {
                const anchor = point.get("anchor") as YPoint;
                const control1 = point.get("control1") as YPoint;
                const control2 = point.get("control2") as YPoint;

                return {
                  anchor: {
                    x: anchor.get("x"),
                    y: anchor.get("y"),
                  },
                  control1: {
                    x: control1.get("x"),
                    y: control1.get("y"),
                  },
                  control2: {
                    x: control2.get("x"),
                    y: control2.get("y"),
                  },
                  type: point.get("type") as BezierPointType,
                };
              })
            ),
        })
      ),
    };
  }

  fromJSON(data: VectorDocumentData): void {
    // Clear existing data
    this.layers.delete(0, this.layers.length);

    // Import layers
    data.layers.forEach((layerData: LayerData) => {
      const layerId = this.createLayer(layerData.name, layerData.visible);

      // Import curves for this layer
      layerData.curves.forEach((curveData: BezierPointData[]) => {
        this.createCurve(layerId, curveData);
      });
    });
  }

  // Observation methods for real-time updates
  observeLayers(callback: (event: Y.YArrayEvent<YLayer>) => void): void {
    this.layers.observe(callback);
  }

  observeLayer(
    layerId: string,
    callback: (event: Y.YMapEvent<any>) => void
  ): void {
    const layer = this.getLayer(layerId);
    if (layer) {
      layer.observe(callback);
    }
  }

  observeCurves(
    layerId: string,
    callback: (event: Y.YArrayEvent<YCurve>) => void
  ): void {
    const layer = this.getLayer(layerId);
    if (layer) {
      const curves = layer.get("curves") as Y.Array<YCurve>;
      curves.observe(callback);
    }
  }

  observeCurve(
    layerId: string,
    curveIndex: number,
    callback: (event: Y.YArrayEvent<YBezierPoint>) => void
  ): void {
    const curve = this.getCurve(layerId, curveIndex);
    if (curve) {
      curve.observe(callback);
    }
  }

  // Collaboration methods
  getStateVector(): Uint8Array {
    return Y.encodeStateVector(this.doc);
  }

  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update);
  }

  onUpdate(callback: (update: Uint8Array, origin: any) => void): void {
    this.doc.on("update", callback);
  }

  // Backup and Restore
  async createBackup(backupName?: string): Promise<string | null> {
    try {
      const data = this.toJSON();
      const backup: BackupInfo = {
        name: backupName || `backup-${Date.now()}`,
        timestamp: Date.now(),
        data: data,
      };

      // Store backup in a separate IndexedDB entry
      const backupPersistence = new IndexeddbPersistence(
        `${this.documentName}-backup-${backup.name}`,
        new Y.Doc()
      );
      const backupDoc = backupPersistence.doc;
      const backupArray = backupDoc.getArray<BackupInfo>("backup");
      backupArray.push([backup]);

      await new Promise<void>((resolve) => {
        backupPersistence.on("synced", resolve);
      });

      backupPersistence.destroy();
      return backup.name;
    } catch (error) {
      console.error("Failed to create backup:", error);
      return null;
    }
  }

  async restoreFromBackup(backupName: string): Promise<boolean> {
    try {
      const backupPersistence = new IndexeddbPersistence(
        `${this.documentName}-backup-${backupName}`,
        new Y.Doc()
      );

      await new Promise<void>((resolve) => {
        backupPersistence.on("synced", resolve);
      });

      const backupArray = backupPersistence.doc.getArray<BackupInfo>("backup");
      if (backupArray.length > 0) {
        const backup = backupArray.get(0);
        this.fromJSON(backup.data);
        await this.save();
      }

      backupPersistence.destroy();
      return true;
    } catch (error) {
      console.error("Failed to restore backup:", error);
      return false;
    }
  }

  async listBackups(): Promise<BackupListItem[]> {
    try {
      // This is a simplified version - in a real implementation you'd want
      // to maintain a registry of backups
      const databases = await indexedDB.databases();
      const backupPrefix = `${this.documentName}-backup-`;

      return databases
        .filter((db) => db.name && db.name.startsWith(backupPrefix))
        .map((db) => ({
          name: db.name!.replace(backupPrefix, ""),
          fullName: db.name!,
        }));
    } catch (error) {
      console.error("Failed to list backups:", error);
      return [];
    }
  }

  async deleteBackup(backupName: string): Promise<boolean> {
    try {
      const dbName = `${this.documentName}-backup-${backupName}`;
      return new Promise((resolve, reject) => {
        const deleteReq = indexedDB.deleteDatabase(dbName);
        deleteReq.onerror = () => reject(deleteReq.error);
        deleteReq.onsuccess = () => resolve(true);
        deleteReq.onblocked = () => reject(new Error("Delete blocked"));
      });
    } catch (error) {
      console.error("Failed to delete backup:", error);
      return false;
    }
  }

  // Cleanup
  async destroy(): Promise<boolean> {
    try {
      // Save final state before destroying
      if (this.options.autoSave) {
        await this.save();
      }

      // Clear undo/redo callbacks
      this.undoRedoCallbacks.clear();

      // Destroy undo manager
      if (this.undoManager) {
        this.undoManager.destroy();
      }

      // Destroy persistence
      this.persistence.destroy();

      // Destroy document
      this.doc.destroy();

      return true;
    } catch (error) {
      console.error("Failed to destroy document:", error);
      return false;
    }
  }
}

// // Usage Example with Persistence and Undo/Redo
// async function example(): Promise<void> {
//   // Create a vector document with IndexedDB persistence and undo/redo
//   const vectorDoc = new VectorDocument('my-vector-project', {
//     autoSave: true,
//     saveDebounceMs: 500, // Save 500ms after last change
//     enableUndo: true,
//     undoStackSize: 100,
//     captureTimeout: 500 // Group operations within 500ms into single undo step
//   })

//   // Wait for document to load from IndexedDB
//   await vectorDoc.load()
//   console.log('Document loaded from IndexedDB')

//   // Listen to undo/redo events
//   const unsubscribeUndoRedo = vectorDoc.onUndoRedo(event => {
//     console.log(`${event.type} performed:`, vectorDoc.getUndoRedoState())
//   })

//   // Create operations that can be undone
//   const layerId = vectorDoc.createLayer('Background Layer')
//   console.log('Can undo after layer creation:', vectorDoc.canUndo())

//   // Create multiple operations in a single undo group
//   const curvePoints: BezierPointData[] = [
//     {
//       anchor: { x: 100, y: 100 },
//       control1: { x: 80, y: 80 },
//       control2: { x: 120, y: 80 },
//       type: 'smooth'
//     },
//     {
//       anchor: { x: 200, y: 150 },
//       control1: { x: 180, y: 130 },
//       control2: { x: 220, y: 170 },
//       type: 'corner'
//     }
//   ]

//   // Use withUndoGroup to batch multiple operations
//   const curveIndex = vectorDoc.withUndoGroup(() => {
//     const idx = vectorDoc.createCurve(layerId, curvePoints)

//     // Add more points to the same undo group
//     if (idx !== null) {
//       vectorDoc.addBezierPoint(layerId, idx, {
//         anchor: { x: 300, y: 200 },
//         control1: { x: 280, y: 180 },
//         control2: { x: 320, y: 220 },
//         type: 'smooth'
//       })
//     }

//     return idx
//   })

//   console.log('Undo/Redo state after curve creation:', vectorDoc.getUndoRedoState())

//   // Update a bezier point (separate undo step)
//   if (curveIndex !== null) {
//     vectorDoc.updateBezierPoint(layerId, curveIndex, 0, {
//       anchor: { x: 110, y: 110 },
//       type: 'corner'
//     })
//   }

//   // Test undo functionality
//   console.log('Before undo:', vectorDoc.toJSON().layers.length)

//   vectorDoc.undo() // Undo point update
//   console.log('After first undo (point update undone)')

//   vectorDoc.undo() // Undo curve creation (including added point)
//   console.log('After second undo (curve creation undone)')

//   vectorDoc.undo() // Undo layer creation
//   console.log('After third undo (layer creation undone):', vectorDoc.toJSON().layers.length)

//   // Test redo functionality
//   vectorDoc.redo() // Redo layer creation
//   vectorDoc.redo() // Redo curve creation
//   console.log('After redos:', vectorDoc.getUndoRedoState())

//   // Manual save
//   await vectorDoc.save()
//   console.log('Document saved manually')

//   // Create a backup
//   const backupName = await vectorDoc.createBackup('before-major-changes')
//   console.log('Backup created:', backupName)

//   // Clear undo/redo history (useful after major operations like loading)
//   vectorDoc.clearUndoRedoHistory()
//   console.log('Undo/Redo history cleared:', vectorDoc.getUndoRedoState())

//   // Export current state
//   console.log('Current document structure:', vectorDoc.toJSON())

//   // Clean up
//   unsubscribeUndoRedo()
// }saveDebounceMs: 500 // Save 500ms after last change
//   })

//   // Wait for document to load from IndexedDB
//   await vectorDoc.load()
//   console.log('Document loaded from IndexedDB')

//   // Create a layer (this will be automatically persisted)
//   const layerId = vectorDoc.createLayer('Background Layer')

//   // Create a curve with some bezier points
//   const curvePoints: BezierPointData[] = [
//     {
//       anchor: { x: 100, y: 100 },
//       control1: { x: 80, y: 80 },
//       control2: { x: 120, y: 80 },
//       type: 'smooth'
//     },
//     {
//       anchor: { x: 200, y: 150 },
//       control1: { x: 180, y: 130 },
//       control2: { x: 220, y: 170 },
//       type: 'corner'
//     }
//   ]

//   const curveIndex = vectorDoc.createCurve(layerId, curvePoints)

//   // Update a bezier point (will trigger auto-save)
//   if (curveIndex !== null) {
//     vectorDoc.updateBezierPoint(layerId, curveIndex, 0, {
//       anchor: { x: 110, y: 110 },
//       type: 'corner'
//     })
//   }

//   // Manual save
//   await vectorDoc.save()
//   console.log('Document saved manually')

//   // Create a backup
//   const backupName = await vectorDoc.createBackup('before-major-changes')
//   console.log('Backup created:', backupName)

//   // Get storage usage
//   const storageInfo = await vectorDoc.getStorageSize()
//   console.log('Storage usage:', storageInfo)

//   // Listen for changes (these will be auto-saved)
//   vectorDoc.observeLayers(event => {
//     console.log('Layers changed (will be auto-saved):', event)
//   })

//   // Export current state
//   console.log('Current document structure:', vectorDoc.toJSON())

//   // List all backups
//   const backups = await vectorDoc.listBackups()
//   console.log('Available backups:', backups)
// }

// // Initialize and run example
// example().catch(console.error)

export default VectorDocument;
export type {
  Point,
  BezierPointData,
  LayerData,
  VectorDocumentData,
  VectorDocumentOptions,
  StorageInfo,
  BackupInfo,
  BackupListItem,
  BezierPointType,
  LayerUpdates,
  BezierPointUpdates,
};
