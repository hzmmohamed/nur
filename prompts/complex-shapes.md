# Bezier Path Classes for Konva - Implementation Prompt

I need to implement a hierarchy of wrapper classes for a vector drawing app using Konva.js. The classes should manage cubic Bezier curves with an interface similar to Figma/Photoshop's pen tool.

## Requirements

### Class Hierarchy

1. **BezierPointHandle** - Represents a single control handle (handle-in or handle-out)
2. **BezierPoint** - Represents a point on the curve with two handles
3. **BezierPath** - Represents the complete Bezier curve path composed of multiple points
4. **BezierLayer** - Custom Konva Layer wrapper that automatically initializes Bezier classes

### BezierPointHandle Class

- Should wrap Konva shape(s) to visually represent a control handle
- Properties:
  - Position (x, y) relative to its parent point
  - Visual state (normal, hovered, selected)
  - Handle type (handle-in or handle-out)
  - Interactivity flags (canHover, canSelect)
- Methods:
  - Update position
  - Show/hide
  - Enable/disable hover state
  - Enable/disable selected state
  - Set visual state (normal, hovered, selected)
  - Event handlers for drag interactions
  - `updateScale(inverseScale)` - scales the handle shapes to maintain constant visual size
- Rendering: A small circle (handle point) connected to its anchor point by a line
- Behavior:
  - When hovering over either the handle point OR the connecting line, BOTH should be highlighted
  - Dragging should only be possible from the handle point itself, not from the line
  - Should notify parent BezierPoint when position changes
  - **Does NOT have its own scale listener** - scaling is managed by parent BezierPoint

### BezierPoint Class

- Should wrap Konva shape(s) and contain two BezierPointHandle instances
- Properties:
  - Anchor position (x, y)
  - Handle-in instance
  - Handle-out instance
  - Point type (smooth, mirrored, disconnected, corner)
  - Visual state (normal, hovered, selected)
  - Handle visibility mode (always visible, visible when selected, always hidden)
  - Interactivity flags (canHover, canSelect)
- Methods:
  - Update position (should update handles accordingly)
  - Show/hide handles (with option to show/hide individually or both)
  - Enable/disable hover state
  - Enable/disable selected state
  - Set visual state (normal, hovered, selected)
  - Toggle handle visibility mode
  - Toggle handle behavior mode
  - Event handlers for point interactions
  - Render with or without handles based on current state
  - `initialize()` - attaches scale listener to stage and applies initial scale
- Rendering:
  - The anchor point, optionally with both handles and connecting lines based on visibility settings
  - **The anchor circle should render on top of handle lines** (add anchor to group last)
  - The anchor circle should have a larger hit area (`hitStrokeWidth`) for easier dragging
- Behavior:
  - Should notify parent BezierPath when position or handles change
  - Maintains constant visual size regardless of stage zoom by scaling individual shapes (anchor circle and handles)
  - When stage scale changes, scales the anchor circle and calls `updateScale()` on both handles

### BezierPath Class

- Should wrap Konva.Line or Konva.Path and contain multiple BezierPoint instances
- Properties:
  - Array of BezierPoint instances
  - Path closed/open state
  - Stroke properties (color, width, etc.)
  - Fill properties
  - Visual state (normal, hovered, selected)
  - Interactivity flags (canHover, canSelect)
  - Base stroke width (for scaling)
- Methods:
  - Add/remove/insert points
  - **When adding/inserting points dynamically, automatically initialize them if path is already on stage**
  - Select/deselect points
  - Enable/disable hover state (for all points)
  - Enable/disable selected state (for all points)
  - Set visual state (normal, hovered, selected)
  - Convert points array to SVG path data
  - Show/hide all handles globally
  - Event handlers for path-level interactions
  - `initialize()` - attaches scale listener and initializes all child points
- Rendering: The smooth cubic Bezier curve through all points
- Behavior:
  - **Automatically updates the Konva path whenever points or handles change**. This should happen internally through callbacks/observers, not via manual method calls.
  - Maintains constant stroke width regardless of stage zoom by scaling the stroke width

### BezierLayer Class

- Extends Konva.Layer
- Overrides the `add()` method to:
  - Accept BezierPath, BezierPoint, or BezierPointHandle instances
  - Automatically call `getGroup()` on these instances and add the group to the layer
  - Automatically call `initialize()` on these instances
  - Fall back to normal behavior for regular Konva nodes
- Usage: `layer.add(path)` instead of `layer.add(path.getGroup()); path.initialize();`

### Constant Visual Size Implementation

All interactive elements (points, handles, path stroke) should maintain constant visual size regardless of stage zoom:

1. **Scale Event System:**

   - Application code must fire a custom `scaleChange` event when zooming: `stage.fire('scaleChange')`
   - Each class listens to this event and updates its visual scale accordingly

2. **Scaling Strategy:**

   - **BezierPointHandle**: No scale listener. Exposes `updateScale()` method called by parent
   - **BezierPoint**: Scales individual shapes (anchor circle) and calls `updateScale()` on child handles
   - **BezierPath**: Scales stroke width to maintain constant thickness
   - **DO NOT scale groups** - this causes position shifting. Scale individual shapes instead.

3. **Initialization Flow:**
   - When added via BezierLayer, `initialize()` is called automatically
   - `initialize()` attaches the `scaleChange` listener to the stage
   - Points added dynamically are automatically initialized if parent is already on stage
   - Child objects are initialized through cascading (BezierPath initializes its points)

### Additional Considerations

- Each class should manage its own Konva.Group (NOT layers - these classes should not utilize layers at all)
- Handle proper cleanup/destruction of Konva shapes and groups, including removing scale event listeners
- Support for drag interactions with proper coordinate transformations
- Handle visibility can be controlled at both the point level and path level
- When hover/select is disabled, the visual state should not change on user interaction
- Disabling states should also prevent the corresponding event handlers from triggering state changes
- Implement a change notification system (callbacks, events, or observers) so that:
  - When a handle position changes, it notifies its parent point
  - When a point or its handles change, it notifies its parent path
  - When a path receives notifications, it automatically redraws the curve
- For BezierPointHandle, ensure the line has a larger hitbox/stroke width (`hitStrokeWidth`) for easier hovering, but remains non-draggable
- For BezierPoint anchor circle, use `hitStrokeWidth` for a larger drag target area
- Maintain references between related objects (handles know their parent point, points know their parent path)
- Consider performance for paths with many points
- BezierPoint should efficiently render without creating handle instances when they're not needed

### Example Usage Pattern

```typescript
// Create stage and custom layer
const stage = new Konva.Stage({ container: 'container', width: 800, height: 600 });
const layer = new BezierLayer();
stage.add(layer);

// Helper to zoom and notify shapes
const setStageScale = (scale: number) => {
  stage.scale({ x: scale, y: scale });
  stage.fire('scaleChange'); // Required for shape scaling
  layer.batchDraw();
};

// Create and add path
const path = new BezierPath([...], false, '#000', 2);
layer.add(path); // Automatically initializes

// Dynamically add points (automatically initialized)
path.addPoint({ x: 100, y: 100 });

// Zoom
setStageScale(2); // All shapes maintain constant visual size
```

Please implement these four classes with clean separation of concerns, proper TypeScript types (or JSDoc if using JavaScript), and methods for common operations like updating positions, toggling visibility, toggling interactivity, and handling user interactions. The path curve should automatically stay synchronized with point/handle changes without requiring manual update calls, and all interactive elements should maintain constant visual size regardless of zoom level.
