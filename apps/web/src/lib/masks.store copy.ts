import * as Y from "yjs";


// Specialized array for TypedYMap objects

class TypedYArrayOfMaps<T> {
  constructor(public readonly yarray: Y.Array<Y.Map<any>>) {}

  // Push TypedYMap objects by extracting their internal Y.Map
  push(items: TypedYMap<T>[]): void {
    const ymaps = items.map((item) => item.ymap);
    this.yarray.push(ymaps);
  }

  // Insert TypedYMap objects at specific index
  insert(index: number, items: TypedYMap<T>[]): void {
    const ymaps = items.map((item) => item.ymap);
    this.yarray.insert(index, ymaps);
  }

  // Delete remains the same
  delete(index: number, length: number = 1): void {
    this.yarray.delete(index, length);
  }

  // Get returns TypedYMap wrapper around the Y.Map
  get(index: number): TypedYMap<T> | undefined {
    const ymap = this.yarray.get(index);
    return ymap ? new TypedYMap<T>(ymap) : undefined;
  }

  length(): number {
    return this.yarray.length;
  }

  // Convert to array of TypedYMap objects
  toArray(): TypedYMap<T>[] {
    return this.yarray.toArray().map((ymap) => new TypedYMap<T>(ymap));
  }

  // Convert to array of plain objects
  toObjectArray(): Partial<T>[] {
    return this.yarray.toArray().map((ymap) => {
      const typedMap = new TypedYMap<T>(ymap);
      return typedMap.toObject();
    });
  }

  observe(callback: (event: Y.YArrayEvent<Y.Map<any>>) => void): void {
    this.yarray.observe(callback);
  }

  unobserve(callback: (event: Y.YArrayEvent<Y.Map<any>>) => void): void {
    this.yarray.unobserve(callback);
  }

  // Utility methods for common operations

  // Find by a property value
  find(predicate: (item: TypedYMap<T>) => boolean): TypedYMap<T> | undefined {
    return this.toArray().find(predicate);
  }

  // Find index by property value
  findIndex(predicate: (item: TypedYMap<T>) => boolean): number {
    return this.toArray().findIndex(predicate);
  }

  // Filter items
  filter(predicate: (item: TypedYMap<T>) => boolean): TypedYMap<T>[] {
    return this.toArray().filter(predicate);
  }

  // Map over items
  map<U>(callback: (item: TypedYMap<T>, index: number) => U): U[] {
    return this.toArray().map(callback);
  }

  // Update an item by index
  updateAt(index: number, updates: Partial<T>): boolean {
    const item = this.get(index);
    if (!item) return false;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        item.set(key as keyof T, value);
      }
    });

    return true;
  }

  // Update first item matching predicate
  updateWhere(
    predicate: (item: TypedYMap<T>) => boolean,
    updates: Partial<T>
  ): boolean {
    const item = this.find(predicate);
    if (!item) return false;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        item.set(key as keyof T, value);
      }
    });

    return true;
  }

  // Remove first item matching predicate
  removeWhere(predicate: (item: TypedYMap<T>) => boolean): boolean {
    const index = this.findIndex(predicate);
    if (index === -1) return false;

    this.delete(index, 1);
    return true;
  }

  // Sort items in place (WARNING: This recreates the entire array)
  sort(compareFn: (a: TypedYMap<T>, b: TypedYMap<T>) => number): void {
    const sortedItems = this.toArray().sort(compareFn);

    // Clear array and re-add sorted items
    this.yarray.delete(0, this.length());
    this.push(sortedItems);
  }
}

// Updated TypedYMap class for completeness
class TypedYMap<T> {
  constructor(public readonly ymap: Y.Map<any>) {}

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.ymap.set(key as string, value);
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.ymap.get(key as string);
  }

  has<K extends keyof T>(key: K): boolean {
    return this.ymap.has(key as string);
  }

  delete<K extends keyof T>(key: K): void {
    this.ymap.delete(key as string);
  }

  observe(callback: (event: Y.YMapEvent<any>) => void): void {
    this.ymap.observe(callback);
  }

  unobserve(callback: (event: Y.YMapEvent<any>) => void): void {
    this.ymap.unobserve(callback);
  }

  toObject(): Partial<T> {
    return this.ymap.toJSON();
  }

  // Utility methods
  keys(): string[] {
    return Array.from(this.ymap.keys());
  }

  values(): any[] {
    return Array.from(this.ymap.values());
  }

  entries(): [string, any][] {
    return Array.from(this.ymap.entries());
  }

  clear(): void {
    this.ymap.clear();
  }

  size(): number {
    return this.ymap.size;
  }

  // Update multiple properties at once
  update(updates: Partial<T>): void {
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        this.set(key as keyof T, value);
      }
    });
  }
}

// Example usage with the video editing project

interface Layer {
  id: string;
  name: string;
  type: "video" | "image" | "text" | "shape" | "adjustment";
  isVisible: boolean;
  isLocked: boolean;
  opacity: number;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
}

interface Frame {
  id: string;
  index: number;
  timestamp: number;
  duration: number;
  name?: string;
  createdAt: number;
  updatedAt: number;
}

// Updated VideoEditingProject class with corrected array handling
export class VideoEditingProject {
  private ydoc: Y.Doc;
  private frames: TypedYArrayOfMaps<Frame>;
  private layers: TypedYArrayOfMaps<Layer>;

  constructor() {
    this.ydoc = new Y.Doc();

    // Use the specialized array class for TypedYMap objects
    this.frames = new TypedYArrayOfMaps(this.ydoc.getArray("frames"));
    this.layers = new TypedYArrayOfMaps(this.ydoc.getArray("layers"));
  }

  // Fixed addFrame method
  addFrame(frameData: Omit<Frame, "id" | "createdAt" | "updatedAt">): string {
    const frame = this.createFrame(frameData);

    // Now correctly pushes the TypedYMap
    this.frames.push([frame]);

    return frame.get("id")!;
  }

  // Fixed addLayer method
  addLayer(layerData: Omit<Layer, "id" | "createdAt" | "updatedAt">): string {
    const layer = this.createLayer(layerData);

    // Now correctly pushes the TypedYMap
    this.layers.push([layer]);

    return layer.get("id")!;
  }

  // Helper methods
  private createFrame(
    data: Omit<Frame, "id" | "createdAt" | "updatedAt">
  ): TypedYMap<Frame> {
    const now = Date.now();
    const frame: Frame = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    const ymap = new Y.Map();
    Object.entries(frame).forEach(([key, value]) => {
      ymap.set(key, value);
    });

    return new TypedYMap<Frame>(ymap);
  }

  private createLayer(
    data: Omit<Layer, "id" | "createdAt" | "updatedAt">
  ): TypedYMap<Layer> {
    const now = Date.now();
    const layer: Layer = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    const ymap = new Y.Map();
    Object.entries(layer).forEach(([key, value]) => {
      ymap.set(key, value);
    });

    return new TypedYMap<Layer>(ymap);
  }

  // Enhanced layer operations using the new array methods
  getAllLayers(): TypedYMap<Layer>[] {
    return this.layers
      .toArray()
      .sort((a, b) => (a.get("zIndex") || 0) - (b.get("zIndex") || 0));
  }

  getLayerById(id: string): TypedYMap<Layer> | undefined {
    return this.layers.find((layer) => layer.get("id") === id);
  }

  updateLayer(id: string, updates: Partial<Layer>): boolean {
    return this.layers.updateWhere((layer) => layer.get("id") === id, {
      ...updates,
      updatedAt: Date.now(),
    });
  }

  removeLayer(id: string): boolean {
    return this.layers.removeWhere((layer) => layer.get("id") === id);
  }

  // Enhanced frame operations
  getAllFrames(): TypedYMap<Frame>[] {
    return this.frames
      .toArray()
      .sort((a, b) => (a.get("index") || 0) - (b.get("index") || 0));
  }

  getFrameById(id: string): TypedYMap<Frame> | undefined {
    return this.frames.find((frame) => frame.get("id") === id);
  }

  updateFrame(id: string, updates: Partial<Frame>): boolean {
    return this.frames.updateWhere((frame) => frame.get("id") === id, {
      ...updates,
      updatedAt: Date.now(),
    });
  }

  removeFrame(id: string): boolean {
    return this.frames.removeWhere((frame) => frame.get("id") === id);
  }

  // Utility methods
  exportLayers(): Partial<Layer>[] {
    return this.layers.toObjectArray();
  }

  exportFrames(): Partial<Frame>[] {
    return this.frames.toObjectArray();
  }

  getYDoc(): Y.Doc {
    return this.ydoc;
  }
}
