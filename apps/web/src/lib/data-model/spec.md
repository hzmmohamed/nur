# Complete Animation Domain Model - Implementation Summary

## **Overview**
A pure TypeScript data model for frame-by-frame animation with masking and lighting layers. Uses cubic Bezier paths with polar coordinate control handles. No UI state, synchronization, or persistence logic - just core domain entities.

---

## **Core Data Structures**

### **Point**
Simple cartesian coordinate.
```typescript
interface Point {
  x: number;
  y: number;
}
```

### **PolarHandle**
Control handle in polar coordinates relative to anchor point.
```typescript
interface PolarHandle {
  angle: number;    // Radians: 0=right, π/2=down, π=left, 3π/2=up
  distance: number; // Distance from anchor point
}
```

### **BezierPoint**
A point in a cubic Bezier path with optional control handles.
```typescript
interface BezierPoint {
  position: Point;
  handleIn: PolarHandle | null;   // Control point before anchor
  handleOut: PolarHandle | null;  // Control point after anchor
}
```

### **CubicBezierPath**
A sequence of Bezier points forming a path.
```typescript
interface CubicBezierPath {
  points: BezierPoint[];
  closed: boolean;  // Whether path forms a closed shape
}
```

### **ClosedCubicBezierPath**
A closed cubic Bezier path with minimum point requirement.
```typescript
interface ClosedCubicBezierPath extends CubicBezierPath {
  closed: true;  // Always closed
  // points.length >= 3 (enforced at runtime)
}
```

---

## **Shared Behavior Interfaces**

### **Identifiable**
```typescript
interface Identifiable {
  id: string;
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

## **Class: CubicBezierPathImpl**

Base class for Bezier paths with full editing capabilities. Can be open or closed.

### **Constructor:**
```typescript
constructor(
  points: BezierPoint[] = [],
  closed: boolean = false
)
```

### **Methods:**

*Shape Properties:*
- `clone(): CubicBezierPathImpl` - Deep copy
- `getBounds(): { minX, minY, maxX, maxY } | null` - Get bounding box (null if no points)
- `isClosed(): boolean` - Check if path is closed
- `setClosed(closed: boolean): void` - Set closed state
- `getPointCount(): number` - Get total number of points
- `getAllPoints(): BezierPoint[]` - Get copy of all points

*Point Management:*
- `addPoint(point: BezierPoint): void` - Add point to end of path
- `insertPoint(index: number, point: BezierPoint): void` - Insert at specific index
- `removePoint(index: number): boolean` - Remove point at index
- `getPoint(index: number): BezierPoint | undefined` - Get point at index

*Point Editing:*
- `updatePoint(index: number, updates: Partial<BezierPoint>): boolean` - Update entire point
- `movePoint(index: number, x: number, y: number): boolean` - Move anchor position

*Handle Editing (Polar):*
- `setPointHandleIn(index: number, angle: number, distance: number): boolean`
- `setPointHandleOut(index: number, angle: number, distance: number): boolean`
- `removePointHandleIn(index: number): boolean` - Set handleIn to null
- `removePointHandleOut(index: number): boolean` - Set handleOut to null

*Handle Editing (Cartesian):*
- `setPointHandleInCartesian(index: number, handleX: number, handleY: number): boolean`
- `setPointHandleOutCartesian(index: number, handleX: number, handleY: number): boolean`

*Bulk Editing:*
- `setPoints(points: BezierPoint[]): void` - Replace all points at once
- `clear(): void` - Remove all points

---

## **Class: ClosedCubicBezierPathImpl extends CubicBezierPathImpl**

Enforces closed path with minimum 3 points. Used for all shapes in the animation domain.

### **Constructor:**
```typescript
constructor(
  points: BezierPoint[]  // Must have at least 3 points
)
// Throws error if points.length < 3
// Automatically sets closed = true
```

### **Overridden Methods:**

*Shape Properties:*
- `clone(): ClosedCubicBezierPathImpl` - Deep copy as ClosedCubicBezierPath
- `getBounds(): { minX, minY, maxX, maxY }` - Get bounding box (never null, always has >= 3 points)
- `isClosed(): boolean` - Always returns true
- `setClosed(closed: boolean): void` - Throws error if attempting to set to false
- `getPointCount(): number` - Always returns >= 3

*Point Management (Protected):*
- `removePoint(index: number): boolean` - Remove point at index (returns false if it would leave < 3 points)

*Bulk Editing (Protected):*
- `setPoints(points: BezierPoint[]): void` - Replace all points at once (throws error if points.length < 3)
- `clear(): void` - Throws error (cannot clear a closed path)

*All other methods inherited from CubicBezierPathImpl*

---

## **Entity: AnimationFrame**

Represents a single frame in the animation timeline.

### **Interface**
```typescript
interface AnimationFrame extends Identifiable, Ordered {
  index: number;          // Frame number in sequence (0, 1, 2, ...)
  timestamp: number;      // Time in milliseconds from animation start
  duration?: number;      // Frame display duration (for variable frame rates)
  thumbnailUrl?: string;  // Reference frame image URL
  metadata?: Record<string, any>;
}
```

### **Class: AnimationFrameImpl**

**Constructor:**
```typescript
constructor(
  id: string,
  index: number,
  timestamp: number,
  order: number = 0,
  duration?: number,
  thumbnailUrl?: string,
  metadata?: Record<string, any>
)
```

**Methods:**
- `clone(): AnimationFrameImpl` - Deep copy with new ID

---

## **Entity: MaskingShape**

A closed cubic Bezier path defining a mask boundary on a specific frame.

### **Interface**
```typescript
interface MaskingShape extends Identifiable {
  frameId: string;  // Which animation frame this shape belongs to
  path: ClosedCubicBezierPathImpl;  // Always closed, >= 3 points
}
```

### **Class: MaskingShapeImpl**

**Constructor:**
```typescript
constructor(
  id: string,
  frameId: string,
  path: ClosedCubicBezierPathImpl
)

// Convenience constructor with points
constructor(
  id: string,
  frameId: string,
  points: BezierPoint[]  // Must have at least 3 points
)
// Creates a ClosedCubicBezierPathImpl internally
// Throws error if points.length < 3
```

**Methods:**

*Path Access:*
- `getPath(): ClosedCubicBezierPathImpl` - Get the path for granular editing
- `clone(): MaskingShapeImpl` - Deep copy with new ID
- `getBounds(): { minX, minY, maxX, maxY }` - Get bounding box (delegates to path)

---

## **Entity: MaskingLayer**

A layer representing a character or body part, with multiple shapes per frame.

### **Interface**
```typescript
interface MaskingLayer extends Identifiable, Named, Visible, Ordered {
  shapes: Map<string, MaskingShape[]>;  // Key: frameId, Value: array of shapes
  color?: string;  // Display color for UI
  metadata?: Record<string, any>;
}
```

### **Class: MaskingLayerImpl**

**Constructor:**
```typescript
constructor(
  id: string,
  name: string,
  visible: boolean = true,
  order: number = 0,
  shapes: MaskingShape[] = [],  // Auto-grouped by frameId
  color?: string,
  metadata?: Record<string, any>
)
```

**Methods:**

*Shape Management:*
- `createShapeForFrame(frameId: string, points: BezierPoint[]): MaskingShape` - Create and add new shape (throws error if points.length < 3)
- `createShapeForFrameFromPath(frameId: string, path: ClosedCubicBezierPathImpl): MaskingShape` - Create from existing path
- `addShapeToFrame(frameId: string, shape: MaskingShape): void` - Add existing shape
- `removeShapeFromFrame(frameId: string, shapeId: string): boolean` - Remove specific shape
- `removeAllShapesForFrame(frameId: string): boolean` - Clear all shapes for frame

*Shape Queries:*
- `getShapesForFrame(frameId: string): MaskingShape[]` - Get all shapes for frame
- `getShapeById(frameId: string, shapeId: string): MaskingShape | undefined`
- `getDefinedFrameIds(): string[]` - Get all frames with shapes
- `hasShapesForFrame(frameId: string): boolean`
- `getTotalShapeCount(): number` - Count across all frames
- `getShapeCountForFrame(frameId: string): number`

*Utility:*
- `clone(): MaskingLayerImpl` - Deep copy with new ID

---

## **Entity: LightingLayerShape**

Two concentric closed Bezier paths defining a light source with diffusion gradient.

### **Interface**
```typescript
interface LightingLayerShape extends Identifiable {
  frameId: string;
  innerPath: ClosedCubicBezierPathImpl;  // Base light shape (must be smaller)
  outerPath: ClosedCubicBezierPathImpl;  // Diffusion boundary (must be larger)
  baseColor: string;                     // Color (hex/rgb/rgba)
  intensity: number;                     // 0-1, brightness
  falloffType: 'linear' | 'exponential' | 'smooth';
}
```

### **Class: LightingLayerShapeImpl**

**Constructor:**
```typescript
constructor(
  id: string,
  frameId: string,
  innerPath: ClosedCubicBezierPathImpl,  // Must have >= 3 points
  outerPath: ClosedCubicBezierPathImpl,  // Must have >= 3 points
  baseColor: string,
  intensity: number = 1.0,
  falloffType: 'linear' | 'exponential' | 'smooth' = 'smooth'
)
```

**Methods:**

*Path Access:*
- `getInnerPath(): ClosedCubicBezierPathImpl` - Get inner path for granular editing
- `getOuterPath(): ClosedCubicBezierPathImpl` - Get outer path for granular editing
- `clone(): LightingLayerShapeImpl` - Deep copy with new ID

*Validation:*
- `isValid(): boolean` - Check that inner path bounds are within outer path bounds
- `getInnerBounds(): { minX, minY, maxX, maxY }` - Get inner path bounding box
- `getOuterBounds(): { minX, minY, maxX, maxY }` - Get outer path bounding box

**Validation Logic:**

`isValid()` returns `true` only if inner path fits completely within outer path:
- `innerBounds.minX >= outerBounds.minX`
- `innerBounds.minY >= outerBounds.minY`
- `innerBounds.maxX <= outerBounds.maxX`
- `innerBounds.maxY <= outerBounds.maxY`

---

## **Entity: LightingLayer**

A lighting effect layer applying to a masking layer, with blend modes.

### **BlendMode Interface**
```typescript
interface BlendMode {
  type: 'normal' | 'add' | 'multiply' | 'screen' | 'overlay';
}
```

### **Interface**
```typescript
interface LightingLayer extends Identifiable, Named, Visible, Ordered {
  maskingLayerId: string;  // Which masking layer this lights
  shapes: Map<string, LightingLayerShape[]>;  // Key: frameId
  blendMode: BlendMode;
  opacity: number;  // 0-1, overall layer opacity
  metadata?: Record<string, any>;
}
```

### **Class: LightingLayerImpl**

**Constructor:**
```typescript
constructor(
  id: string,
  maskingLayerId: string,
  name: string,
  visible: boolean = true,
  order: number = 0,
  shapes: LightingLayerShape[] = [],  // Auto-grouped by frameId
  blendMode: BlendMode = { type: 'normal' },
  opacity: number = 1.0,
  metadata?: Record<string, any>
)
```

**Methods:**

*Shape Management:*
- `createShapeForFrame(frameId: string, innerPath: ClosedCubicBezierPathImpl, outerPath: ClosedCubicBezierPathImpl, baseColor: string, options?: { intensity?: number; falloffType?: LightingLayerShape['falloffType'] }): LightingLayerShape` - Throws error if either path has < 3 points
- `addShapeToFrame(frameId: string, shape: LightingLayerShape): void`
- `removeShapeFromFrame(frameId: string, shapeId: string): boolean`
- `removeAllShapesForFrame(frameId: string): boolean`

*Shape Queries:*
- `getShapesForFrame(frameId: string): LightingLayerShape[]`
- `getShapeById(frameId: string, shapeId: string): LightingLayerShape | undefined`
- `getDefinedFrameIds(): string[]`
- `hasShapesForFrame(frameId: string): boolean`
- `getTotalShapeCount(): number`
- `getShapeCountForFrame(frameId: string): number`

*Utility:*
- `clone(): LightingLayerImpl` - Deep copy with new ID

---

## **Entity: AnimationProject**

Root container for the entire animation.

### **Interface**
```typescript
interface AnimationProject extends Identifiable, Named {
  frames: AnimationFrame[];
  maskingLayers: MaskingLayer[];
  lightingLayers: LightingLayer[];
  frameRate: number;  // Frames per second
  width: number;      // Canvas width
  height: number;     // Canvas height
  metadata?: Record<string, any>;
}
```

### **Class: AnimationProjectImpl**

**Constructor:**
```typescript
constructor(
  id: string,
  name: string,
  frames: AnimationFrame[] = [],
  maskingLayers: MaskingLayer[] = [],
  lightingLayers: LightingLayer[] = [],
  frameRate: number = 24,
  width: number = 1920,
  height: number = 1080,
  metadata?: Record<string, any>
)
```

**Methods:**

*Frame Queries:*
- `getFrameByIndex(index: number): AnimationFrame | undefined`
- `getFrameById(id: string): AnimationFrame | undefined`
- `getTotalDuration(): number` - Total animation duration in milliseconds

*Layer Queries:*
- `getMaskingLayerById(id: string): MaskingLayer | undefined`
- `getLightingLayerById(id: string): LightingLayer | undefined`
- `getLightingLayersForMask(maskingLayerId: string): LightingLayer[]` - Sorted by order
- `getVisibleMaskingLayers(): MaskingLayer[]` - Visible only, sorted by order
- `getVisibleLightingLayersForMask(maskingLayerId: string): LightingLayer[]` - Visible only, sorted by order

---

## **Factory API: AnimationDomain**

Namespace with factory functions and utilities.

### **Entity Factories:**

```typescript
AnimationDomain.createFrame(
  index: number, 
  timestamp: number, 
  options?: Partial<AnimationFrame>
): AnimationFrameImpl

// Base path factory (can be open or closed)
AnimationDomain.createPath(
  points?: BezierPoint[],
  closed?: boolean
): CubicBezierPathImpl

// Closed path factory (enforces >= 3 points)
AnimationDomain.createClosedPath(
  points: BezierPoint[]  // Must have at least 3 points
): ClosedCubicBezierPathImpl
// Throws error if points.length < 3

// Convenience factory for creating minimal valid closed path
AnimationDomain.createMinimalClosedPath(
  center: Point,
  radius: number,
  pointCount?: number  // Default 4 for circle-like shape
): ClosedCubicBezierPathImpl
// Creates a circular closed path with specified number of points (minimum 3)

AnimationDomain.createMaskingLayer(
  name: string, 
  options?: Partial<MaskingLayer>
): MaskingLayerImpl

AnimationDomain.createLightingLayer(
  maskingLayerId: string, 
  name: string, 
  options?: Partial<LightingLayer>
): LightingLayerImpl

AnimationDomain.createProject(
  name: string, 
  options?: Partial<AnimationProject>
): AnimationProjectImpl
```

### **Coordinate Conversion Utilities:**

```typescript
AnimationDomain.cartesianToPolar(
  anchorX: number, 
  anchorY: number, 
  handleX: number, 
  handleY: number
): PolarHandle
// Converts handle's cartesian position to polar coordinates relative to anchor

AnimationDomain.polarToCartesian(
  anchorX: number, 
  anchorY: number, 
  angle: number, 
  distance: number
): Point
// Converts polar coordinates to cartesian position for rendering

AnimationDomain.getHandleCartesian(
  point: BezierPoint, 
  handleType: 'in' | 'out'
): Point | null
// Helper to get cartesian coordinates of a specific handle
```

---

## **Key Design Features**

1. **Dual Path Classes** - Base `CubicBezierPathImpl` for flexibility, `ClosedCubicBezierPathImpl` for domain shapes
2. **Polar Coordinate Handles** - Control handles use angle/distance for intuitive editing
3. **Centralized Path Editing** - All granular editing operations in path classes
4. **Path Exposure** - Shapes expose their paths for direct editing
5. **Multiple Shapes Per Frame** - Layers support multiple shapes per frame
6. **Frame-Based Association** - Shapes stored in Map<frameId, Shape[]> for O(1) lookup
7. **Layer Stacking** - `order` property for z-index control
8. **Visibility Control** - All layers have visibility flags
9. **Blend Modes** - Lighting layers support 5 blend modes
10. **Deep Cloning** - All entities support cloning with new IDs
11. **Type Safety** - Full TypeScript interfaces and types
12. **Pure Data Model** - No UI state, synchronization, or persistence logic
13. **Extensible Metadata** - All major entities support custom metadata
14. **Concentric Light Definition** - Realistic light with inner/outer diffusion paths

---

## **Usage Examples**

### **Using Base Path (Open or Closed):**
```typescript
// Open path with any number of points
const openPath = AnimationDomain.createPath([
  { position: { x: 0, y: 0 }, handleIn: null, handleOut: null }
], false);

openPath.addPoint({ position: { x: 100, y: 100 }, handleIn: null, handleOut: null });
openPath.clear(); // OK - can clear open paths
```

### **Using Closed Path (Enforced >= 3 points):**
```typescript
// Must provide at least 3 points
const points: BezierPoint[] = [
  { 
    position: { x: 100, y: 100 }, 
    handleIn: { angle: Math.PI * 1.5, distance: 30 }, 
    handleOut: { angle: Math.PI * 0.5, distance: 30 } 
  },
  { 
    position: { x: 200, y: 150 }, 
    handleIn: { angle: Math.PI, distance: 40 }, 
    handleOut: { angle: 0, distance: 40 } 
  },
  { 
    position: { x: 150, y: 220 }, 
    handleIn: { angle: Math.PI * 0.5, distance: 35 }, 
    handleOut: { angle: Math.PI * 1.5, distance: 35 } 
  }
];

const closedPath = AnimationDomain.createClosedPath(points);

// This throws an error - only 2 points
try {
  const invalidPath = AnimationDomain.createClosedPath([points[0], points[1]]);
} catch (error) {
  console.error("Cannot create closed path with < 3 points:", error);
}

// Cannot set to open
try {
  closedPath.setClosed(false);
} catch (error) {
  console.error("Cannot open a ClosedCubicBezierPath:", error);
}

// Cannot clear
try {
  closedPath.clear();
} catch (error) {
  console.error("Cannot clear a ClosedCubicBezierPath:", error);
}

// Can add points
closedPath.addPoint({
  position: { x: 180, y: 180 },
  handleIn: null,
  handleOut: null
});

// Can remove points (as long as >= 3 remain)
const removed = closedPath.removePoint(3); // true
const cannotRemove = closedPath.removePoint(0); // false if only 3 points remain
```

### **Creating Masking Shapes:**
```typescript
// Option 1: Create with closed path
const closedPath = AnimationDomain.createClosedPath(points);
const shape1 = character.createShapeForFrameFromPath(frame1.id, closedPath);

// Option 2: Create directly with points (creates ClosedCubicBezierPathImpl internally)
const shape2 = character.createShapeForFrame(frame1.id, points);

// Option 3: Use minimal path helper
const circularPath = AnimationDomain.createMinimalClosedPath(
  { x: 150, y: 150 },
  50,  // radius
  6    // 6 points for smoother circle
);
const shape3 = character.createShapeForFrameFromPath(frame1.id, circularPath);

// Edit the shape's path
const path = shape1.getPath();
path.addPoint({
  position: { x: 175, y: 175 },
  handleIn: null,
  handleOut: null
});
```

### **Granular Path Editing:**
```typescript
// Create shape with minimal path
const shape = character.createShapeForFrame(frame1.id, [
  { position: { x: 100, y: 100 }, handleIn: null, handleOut: null },
  { position: { x: 200, y: 100 }, handleIn: null, handleOut: null },
  { position: { x: 150, y: 200 }, handleIn: null, handleOut: null }
]);

// Get the path for editing
const path = shape.getPath();

// Add points with polar handles
path.addPoint({
  position: { x: 100, y: 100 },
  handleIn: { angle: Math.PI, distance: 50 },
  handleOut: { angle: 0, distance: 50 }
});

// Edit specific handle
path.setPointHandleOut(0, Math.PI / 4, 75);

// Move point
path.movePoint(0, 110, 105);
```

### **Creating Lighting Shapes:**
```typescript
const rimLight = AnimationDomain.createLightingLayer(character.id, "Rim Light", {
  blendMode: { type: 'add' },
  opacity: 0.8,
  order: 0
});
project.lightingLayers.push(rimLight);

// Create inner path (at least 3 points)
const innerPath = AnimationDomain.createMinimalClosedPath(
  { x: 150, y: 150 }, 
  30,
  4  // 4-point circle
);

// Create outer path (at least 3 points, larger than inner)
const outerPath = AnimationDomain.createMinimalClosedPath(
  { x: 150, y: 150 }, 
  80,
  8  // 8-point circle for smoother gradient
);

// Create the lighting shape
const lightShape = rimLight.createShapeForFrame(
  frame1.id,
  innerPath,
  outerPath,
  "#ffffff",
  { intensity: 0.8, falloffType: 'smooth' }
);

// Validate concentric relationship
if (!lightShape.isValid()) {
  console.warn("Inner path exceeds outer path bounds!");
  const innerBounds = lightShape.getInnerBounds();
  const outerBounds = lightShape.getOuterBounds();
  console.log("Inner:", innerBounds);
  console.log("Outer:", outerBounds);
}

// Edit paths while maintaining validity
lightShape.getInnerPath().movePoint(0, 155, 155);
if (!lightShape.isValid()) {
  console.warn("Edit made inner path invalid - reverting");
  // Revert or adjust
}
```

### **Point Removal Protection in Closed Paths:**
```typescript
const closedPath = AnimationDomain.createClosedPath([
  { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
  { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
  { position: { x: 50, y: 100 }, handleIn: null, handleOut: null }
]);

console.log(closedPath.getPointCount()); // 3

// Try to remove a point when only 3 exist
const removed = closedPath.removePoint(0);
console.log(removed); // false - cannot go below 3 points

// Add a point first
closedPath.addPoint({
  position: { x: 75, y: 50 },
  handleIn: null,
  handleOut: null
});

console.log(closedPath.getPointCount()); // 4

// Now removal works
const removedNow = closedPath.removePoint(0);
console.log(removedNow); // true
console.log(closedPath.getPointCount()); // 3
```

### **Coordinate Conversion:**
```typescript
// Convert cartesian to polar for storage
const polar = AnimationDomain.cartesianToPolar(100, 100, 150, 120);
// Result: { angle: 0.3947..., distance: 53.85... }

// Convert polar to cartesian for rendering
const cartesian = AnimationDomain.polarToCartesian(100, 100, Math.PI/4, 50);
// Result: { x: 135.35..., y: 135.35... }

// Get handle position from BezierPoint
const point: BezierPoint = { 
  position: { x: 100, y: 100 },
  handleOut: { angle: 0, distance: 50 },
  handleIn: null
};
const handlePos = AnimationDomain.getHandleCartesian(point, 'out');
// Result: { x: 150, y: 100 }
```

---

## **Export Summary**

**Types:**
- `Point`, `PolarHandle`, `BezierPoint`
- `CubicBezierPath`, `ClosedCubicBezierPath`
- `Identifiable`, `Named`, `Visible`, `Ordered`
- `AnimationFrame`, `MaskingShape`, `MaskingLayer`
- `LightingLayerShape`, `LightingLayer`, `BlendMode`
- `AnimationProject`

**Classes:**
- `CubicBezierPathImpl` - Base path class (open or closed)
- `ClosedCubicBezierPathImpl extends CubicBezierPathImpl` - Enforced closed path with >= 3 points
- `AnimationFrameImpl`
- `MaskingShapeImpl` - Uses ClosedCubicBezierPathImpl
- `MaskingLayerImpl`
- `LightingLayerShapeImpl` - Uses two ClosedCubicBezierPathImpl instances
- `LightingLayerImpl`
- `AnimationProjectImpl`

**Namespace:**
- `AnimationDomain` (factory functions and utilities)