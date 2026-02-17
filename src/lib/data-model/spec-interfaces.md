# Animation Domain Model - Interface Specification

## **Overview**
Interface-only specification for a frame-by-frame animation domain model with masking and lighting layers. Uses cubic Bezier paths with polar coordinate control handles. This specification defines expected behavior without prescribing implementation details or data structures.

---

## **Core Data Types**

### **Point**
```typescript
interface Point {
  x: number;
  y: number;
}
```

### **PolarHandle**
```typescript
interface PolarHandle {
  angle: number;    // Radians: 0=right, π/2=down, π=left, 3π/2=up
  distance: number; // Distance from anchor point
}
```

### **BezierPoint**
```typescript
interface BezierPoint {
  position: Point;
  handleIn: PolarHandle | null;   // Control point before anchor
  handleOut: PolarHandle | null;  // Control point after anchor
}
```

### **Bounds**
```typescript
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
```

---

## **Shared Behavior Interfaces**

### **Identifiable**
```typescript
interface Identifiable {
  readonly id: string;
}
```

### **Named**
```typescript
interface Named {
  name: string;
}
```

### **Visible**
```typescript
interface Visible {
  visible: boolean;
}
```

### **Ordered**
```typescript
interface Ordered {
  order: number;  // Z-index / stacking order
}
```

---

## **Path Interfaces**

### **ICubicBezierPath**

Base interface for cubic Bezier paths. Can be open or closed, with any number of points.

```typescript
interface ICubicBezierPath {
  // Properties
  readonly pointCount: number;
  readonly closed: boolean;
  
  // Shape Queries
  getBounds(): Bounds | null;  // null if no points
  isClosed(): boolean;
  getPointCount(): number;
  getAllPoints(): BezierPoint[];  // Returns copy
  getPoint(index: number): BezierPoint | undefined;
  
  // State Modification
  setClosed(closed: boolean): void;
  
  // Point Management
  addPoint(point: BezierPoint): void;
  insertPoint(index: number, point: BezierPoint): void;
  removePoint(index: number): boolean;  // Returns false if removal fails
  
  // Point Editing
  updatePoint(index: number, updates: Partial<BezierPoint>): boolean;
  movePoint(index: number, x: number, y: number): boolean;
  
  // Handle Editing (Polar Coordinates)
  setPointHandleIn(index: number, angle: number, distance: number): boolean;
  setPointHandleOut(index: number, angle: number, distance: number): boolean;
  removePointHandleIn(index: number): boolean;  // Sets to null
  removePointHandleOut(index: number): boolean; // Sets to null
  
  // Handle Editing (Cartesian Coordinates)
  setPointHandleInCartesian(index: number, handleX: number, handleY: number): boolean;
  setPointHandleOutCartesian(index: number, handleX: number, handleY: number): boolean;
  
  // Bulk Operations
  setPoints(points: BezierPoint[]): void;
  clear(): void;
  
  // Cloning
  clone(): ICubicBezierPath;
}
```

**Expected Behavior:**
- Path can have 0 or more points
- `getBounds()` returns null if path has no points
- Point indices are 0-based
- All modification methods that can fail return boolean success indicators
- `clone()` creates a deep copy with new object identity

---

### **IClosedCubicBezierPath**

Interface for closed Bezier paths with enforced minimum point count.

```typescript
interface IClosedCubicBezierPath extends ICubicBezierPath {
  // Overridden properties
  readonly closed: true;
  readonly pointCount: number;  // Always >= 3
  
  // Overridden methods with stricter contracts
  getBounds(): Bounds;  // Never null (always has >= 3 points)
  isClosed(): boolean;  // Always returns true
  setClosed(closed: boolean): void;  // Throws error if attempting to set false
  removePoint(index: number): boolean;  // Fails if would leave < 3 points
  setPoints(points: BezierPoint[]): void;  // Throws error if points.length < 3
  clear(): void;  // Throws error (cannot clear closed path)
  
  // Cloning
  clone(): IClosedCubicBezierPath;
}
```

**Expected Behavior:**
- Must be constructed with at least 3 points (throws error otherwise)
- Always closed (cannot be set to open)
- Cannot be cleared
- Cannot remove points if it would leave fewer than 3 points
- Point count is always >= 3

---

## **Entity Interfaces**

### **IAnimationFrame**

Represents a single frame in the animation timeline.

```typescript
interface IAnimationFrame extends Identifiable, Ordered {
  index: number;          // Frame number in sequence (0, 1, 2, ...)
  timestamp: number;      // Time in milliseconds from animation start
  duration?: number;      // Frame display duration (for variable frame rates)
  thumbnailUrl?: string;  // Reference frame image URL
  metadata?: Record<string, any>;
  
  clone(): IAnimationFrame;
}
```

**Expected Behavior:**
- `index` represents position in frame sequence
- `timestamp` is in milliseconds from animation start
- `clone()` creates deep copy with new ID
- `order` property inherited from `Ordered` for layer stacking

---

### **IMaskingShape**

A closed cubic Bezier path defining a mask boundary on a specific frame.

```typescript
interface IMaskingShape extends Identifiable {
  readonly frameId: string;  // Which animation frame this shape belongs to
  
  // Path Access
  getPath(): IClosedCubicBezierPath;
  
  // Computed Properties
  getBounds(): Bounds;
  
  // Cloning
  clone(): IMaskingShape;
}
```

**Expected Behavior:**
- Always contains a closed path with >= 3 points
- `frameId` is immutable
- `getPath()` returns the underlying path for granular editing
- `getBounds()` delegates to path's getBounds()
- `clone()` creates deep copy with new ID and cloned path

---

### **IMaskingLayer**

A layer representing a character or body part, with multiple shapes per frame.

```typescript
interface IMaskingLayer extends Identifiable, Named, Visible, Ordered {
  color?: string;  // Display color for UI
  metadata?: Record<string, any>;
  
  // Shape Management
  createShapeForFrame(frameId: string, points: BezierPoint[]): IMaskingShape;
  createShapeForFrameFromPath(frameId: string, path: IClosedCubicBezierPath): IMaskingShape;
  addShapeToFrame(frameId: string, shape: IMaskingShape): void;
  removeShapeFromFrame(frameId: string, shapeId: string): boolean;
  removeAllShapesForFrame(frameId: string): boolean;
  
  // Shape Queries
  getShapesForFrame(frameId: string): IMaskingShape[];
  getShapeById(frameId: string, shapeId: string): IMaskingShape | undefined;
  getDefinedFrameIds(): string[];
  hasShapesForFrame(frameId: string): boolean;
  getTotalShapeCount(): number;
  getShapeCountForFrame(frameId: string): number;
  
  // Cloning
  clone(): IMaskingLayer;
}
```

**Expected Behavior:**
- Shapes are organized by frameId in an internal map-like structure
- `createShapeForFrame()` throws error if points.length < 3
- `createShapeForFrameFromPath()` adds existing path to layer
- Multiple shapes can exist per frame
- `getShapesForFrame()` returns empty array if no shapes for frame
- `getDefinedFrameIds()` returns all frameIds that have at least one shape
- `clone()` creates deep copy with new ID, cloned shapes

---

### **ILightingLayerShape**

Two concentric closed Bezier paths defining a light source with diffusion gradient.

```typescript
interface ILightingLayerShape extends Identifiable {
  readonly frameId: string;
  baseColor: string;           // Color (hex/rgb/rgba)
  intensity: number;           // 0-1, brightness
  falloffType: 'linear' | 'exponential' | 'smooth';
  
  // Path Access
  getInnerPath(): IClosedCubicBezierPath;
  getOuterPath(): IClosedCubicBezierPath;
  
  // Validation
  isValid(): boolean;  // Inner path must fit within outer path bounds
  getInnerBounds(): Bounds;
  getOuterBounds(): Bounds;
  
  // Cloning
  clone(): ILightingLayerShape;
}
```

**Expected Behavior:**
- Both inner and outer paths must have >= 3 points
- `frameId` is immutable
- `isValid()` returns true only if:
  - `innerBounds.minX >= outerBounds.minX`
  - `innerBounds.minY >= outerBounds.minY`
  - `innerBounds.maxX <= outerBounds.maxX`
  - `innerBounds.maxY <= outerBounds.maxY`
- `intensity` should be clamped to [0, 1] range
- Paths can be edited directly via `getInnerPath()` and `getOuterPath()`
- `clone()` creates deep copy with new ID and cloned paths

---

### **BlendMode**

```typescript
interface BlendMode {
  type: 'normal' | 'add' | 'multiply' | 'screen' | 'overlay';
}
```

---

### **ILightingLayer**

A lighting effect layer applying to a masking layer, with blend modes.

```typescript
interface ILightingLayer extends Identifiable, Named, Visible, Ordered {
  readonly maskingLayerId: string;  // Which masking layer this lights
  blendMode: BlendMode;
  opacity: number;  // 0-1, overall layer opacity
  metadata?: Record<string, any>;
  
  // Shape Management
  createShapeForFrame(
    frameId: string,
    innerPath: IClosedCubicBezierPath,
    outerPath: IClosedCubicBezierPath,
    baseColor: string,
    options?: { intensity?: number; falloffType?: 'linear' | 'exponential' | 'smooth' }
  ): ILightingLayerShape;
  addShapeToFrame(frameId: string, shape: ILightingLayerShape): void;
  removeShapeFromFrame(frameId: string, shapeId: string): boolean;
  removeAllShapesForFrame(frameId: string): boolean;
  
  // Shape Queries
  getShapesForFrame(frameId: string): ILightingLayerShape[];
  getShapeById(frameId: string, shapeId: string): ILightingLayerShape | undefined;
  getDefinedFrameIds(): string[];
  hasShapesForFrame(frameId: string): boolean;
  getTotalShapeCount(): number;
  getShapeCountForFrame(frameId: string): number;
  
  // Cloning
  clone(): ILightingLayer;
}
```

**Expected Behavior:**
- Shapes are organized by frameId in an internal map-like structure
- `maskingLayerId` is immutable and references the masking layer this lights
- `createShapeForFrame()` creates and adds a new lighting shape
- Multiple shapes can exist per frame
- `opacity` should be clamped to [0, 1] range
- `getShapesForFrame()` returns empty array if no shapes for frame
- `clone()` creates deep copy with new ID, cloned shapes

---

### **IAnimationProject**

Root container for the entire animation.

```typescript
interface IAnimationProject extends Identifiable, Named {
  frameRate: number;  // Frames per second
  width: number;      // Canvas width
  height: number;     // Canvas height
  metadata?: Record<string, any>;
  
  // Frame Management
  addFrame(frame: IAnimationFrame): void;
  removeFrame(frameId: string): boolean;
  getFrameByIndex(index: number): IAnimationFrame | undefined;
  getFrameById(id: string): IAnimationFrame | undefined;
  getAllFrames(): IAnimationFrame[];
  getFramesSortedByIndex(): IAnimationFrame[];
  getTotalDuration(): number;  // Total animation duration in milliseconds
  
  // Masking Layer Management
  addMaskingLayer(layer: IMaskingLayer): void;
  removeMaskingLayer(layerId: string): boolean;
  getMaskingLayerById(id: string): IMaskingLayer | undefined;
  getAllMaskingLayers(): IMaskingLayer[];
  getVisibleMaskingLayers(): IMaskingLayer[];  // Visible only, sorted by order
  
  // Lighting Layer Management
  addLightingLayer(layer: ILightingLayer): void;
  removeLightingLayer(layerId: string): boolean;
  getLightingLayerById(id: string): ILightingLayer | undefined;
  getAllLightingLayers(): ILightingLayer[];
  getLightingLayersForMask(maskingLayerId: string): ILightingLayer[];  // Sorted by order
  getVisibleLightingLayersForMask(maskingLayerId: string): ILightingLayer[];  // Visible, sorted by order
}
```

**Expected Behavior:**
- Contains collections of frames, masking layers, and lighting layers
- `getTotalDuration()` calculates sum of all frame durations, or uses frameRate if durations not specified
- Layers returned by `getVisible*` methods are filtered by `visible` property and sorted by `order`
- `getLightingLayersForMask()` filters by `maskingLayerId` and sorts by `order`
- All `remove*` methods return false if entity not found
- All `get*` methods return undefined if entity not found

---

## **Factory Interface**

```typescript
interface IAnimationDomain {
  // Path Factories
  createPath(points?: BezierPoint[], closed?: boolean): ICubicBezierPath;
  createClosedPath(points: BezierPoint[]): IClosedCubicBezierPath;  // Throws if < 3 points
  createMinimalClosedPath(center: Point, radius: number, pointCount?: number): IClosedCubicBezierPath;
  
  // Entity Factories
  createFrame(index: number, timestamp: number, options?: Partial<IAnimationFrame>): IAnimationFrame;
  createMaskingLayer(name: string, options?: Partial<IMaskingLayer>): IMaskingLayer;
  createLightingLayer(maskingLayerId: string, name: string, options?: Partial<ILightingLayer>): ILightingLayer;
  createProject(name: string, options?: Partial<IAnimationProject>): IAnimationProject;
  
  // Coordinate Utilities
  cartesianToPolar(anchorX: number, anchorY: number, handleX: number, handleY: number): PolarHandle;
  polarToCartesian(anchorX: number, anchorY: number, angle: number, distance: number): Point;
  getHandleCartesian(point: BezierPoint, handleType: 'in' | 'out'): Point | null;
}
```

**Expected Behavior:**
- `createMinimalClosedPath()` creates a circular path with specified point count (default 4, minimum 3)
- `createClosedPath()` throws error if points.length < 3
- All `create*` methods generate unique IDs
- `options` parameter allows partial overrides of default values
- Coordinate utilities are pure functions for converting between polar and cartesian coordinates

---

## **Usage Patterns**

### **Creating and Editing Paths**

```typescript
// Create an open path
const openPath = domain.createPath([], false);
openPath.addPoint({ position: { x: 0, y: 0 }, handleIn: null, handleOut: null });

// Create a closed path (minimum 3 points required)
const closedPath = domain.createClosedPath([
  { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
  { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
  { position: { x: 50, y: 100 }, handleIn: null, handleOut: null }
]);

// Edit path directly
closedPath.addPoint({ position: { x: 75, y: 50 }, handleIn: null, handleOut: null });
closedPath.setPointHandleOut(0, Math.PI / 4, 50);
closedPath.movePoint(1, 110, 0);

// Cannot remove below 3 points
const removed = closedPath.removePoint(0); // false if only 3 points remain
```

### **Working with Masking Layers**

```typescript
const character = domain.createMaskingLayer("Character", { color: "#FF6B6B" });

// Create shape directly with points
const shape = character.createShapeForFrame(frame.id, [
  { position: { x: 100, y: 100 }, handleIn: null, handleOut: null },
  { position: { x: 200, y: 100 }, handleIn: null, handleOut: null },
  { position: { x: 150, y: 200 }, handleIn: null, handleOut: null }
]);

// Edit the shape's path
const path = shape.getPath();
path.addPoint({ position: { x: 175, y: 150 }, handleIn: null, handleOut: null });
path.setPointHandleIn(0, Math.PI, 30);

// Query shapes
const shapes = character.getShapesForFrame(frame.id);
const hasShapes = character.hasShapesForFrame(frame.id);
```

### **Working with Lighting Layers**

```typescript
const rimLight = domain.createLightingLayer(character.id, "Rim Light", {
  blendMode: { type: 'add' },
  opacity: 0.8
});

// Create concentric paths
const innerPath = domain.createMinimalClosedPath({ x: 150, y: 150 }, 30, 4);
const outerPath = domain.createMinimalClosedPath({ x: 150, y: 150 }, 80, 8);

// Create lighting shape
const lightShape = rimLight.createShapeForFrame(
  frame.id,
  innerPath,
  outerPath,
  "#ffffff",
  { intensity: 0.8, falloffType: 'smooth' }
);

// Validate and edit
if (!lightShape.isValid()) {
  console.warn("Inner path exceeds outer path bounds");
}

lightShape.getInnerPath().movePoint(0, 155, 155);
```

### **Project Assembly**

```typescript
const project = domain.createProject("My Animation", {
  frameRate: 30,
  width: 1920,
  height: 1080
});

// Add frames
const frame1 = domain.createFrame(0, 0);
const frame2 = domain.createFrame(1, 33.33);
project.addFrame(frame1);
project.addFrame(frame2);

// Add layers
project.addMaskingLayer(character);
project.addLightingLayer(rimLight);

// Query
const visibleLayers = project.getVisibleMaskingLayers();
const lightsForCharacter = project.getLightingLayersForMask(character.id);
const totalDuration = project.getTotalDuration();
```

---

## **Design Principles**

1. **Interface Segregation** - Small, focused interfaces that can be composed
2. **Immutable Identifiers** - IDs and frame associations cannot change after creation
3. **Fail-Safe Operations** - Methods that can fail return boolean or undefined rather than throwing
4. **Deep Cloning** - All entities support deep copying with new IDs
5. **Lazy Evaluation** - Computed properties (bounds, validation) calculated on demand
6. **Type Safety** - Strict TypeScript types for all operations
7. **Pure Domain Logic** - No UI, synchronization, or persistence concerns
8. **Flexible Implementation** - Interfaces allow for multiple data structure backends

---

## **Validation Rules**

### **Path Validation**
- Closed paths must have >= 3 points at all times
- Point indices must be valid (0 <= index < pointCount)
- Handles use polar coordinates with angle in radians and distance >= 0

### **Shape Validation**
- Masking shapes must have valid closed paths
- Lighting shapes must have valid inner and outer paths
- Lighting shape inner path bounds must fit within outer path bounds

### **Layer Validation**
- Layer order values determine z-index stacking
- Lighting layers must reference existing masking layers
- Opacity and intensity values should be in [0, 1] range

### **Frame Validation**
- Frame indices should be non-negative
- Frame timestamps should be non-negative and in milliseconds
- Frame timestamps should generally increase with index

---

## **Export Summary**

**Core Types:**
- `Point`, `PolarHandle`, `BezierPoint`, `Bounds`

**Behavior Interfaces:**
- `Identifiable`, `Named`, `Visible`, `Ordered`

**Path Interfaces:**
- `ICubicBezierPath`, `IClosedCubicBezierPath`

**Entity Interfaces:**
- `IAnimationFrame`, `IMaskingShape`, `IMaskingLayer`
- `ILightingLayerShape`, `ILightingLayer`, `BlendMode`
- `IAnimationProject`

**Factory Interface:**
- `IAnimationDomain`