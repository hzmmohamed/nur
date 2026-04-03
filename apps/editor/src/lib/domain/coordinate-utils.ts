/**
 * Coordinate conversion utilities for Bezier path handles
 * Pure functions for converting between polar and cartesian coordinates
 */

export interface Point {
  x: number;
  y: number;
}

export interface PolarHandle {
  angle: number;    // Radians: 0=right, π/2=down, π=left, 3π/2=up
  distance: number; // Distance from anchor point
}

export interface BezierPoint {
  position: Point;
  handleIn: PolarHandle | null;   // Control point before anchor
  handleOut: PolarHandle | null;  // Control point after anchor
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Convert cartesian coordinates to polar coordinates relative to an anchor point
 */
export function cartesianToPolar(
  anchorX: number,
  anchorY: number,
  handleX: number,
  handleY: number
): PolarHandle {
  const dx = handleX - anchorX;
  const dy = handleY - anchorY;
  
  return {
    angle: Math.atan2(dy, dx),
    distance: Math.sqrt(dx * dx + dy * dy)
  };
}

/**
 * Convert polar coordinates to cartesian coordinates relative to an anchor point
 */
export function polarToCartesian(
  anchorX: number,
  anchorY: number,
  angle: number,
  distance: number
): Point {
  return {
    x: anchorX + Math.cos(angle) * distance,
    y: anchorY + Math.sin(angle) * distance
  };
}

/**
 * Get the cartesian coordinates of a handle from a BezierPoint
 */
export function getHandleCartesian(
  point: BezierPoint,
  handleType: 'in' | 'out'
): Point | null {
  const handle = handleType === 'in' ? point.handleIn : point.handleOut;
  
  if (!handle) {
    return null;
  }
  
  return polarToCartesian(
    point.position.x,
    point.position.y,
    handle.angle,
    handle.distance
  );
}

/**
 * Calculate bounds from an array of bezier points
 * Includes the anchor points and control handles
 */
export function calculateBezierBounds(bezierPoints: BezierPoint[]): Bounds | null {
  if (bezierPoints.length === 0) {
    return null;
  }
  
  const allPoints: Point[] = [];
  
  // Collect all anchor points and handle points
  for (const bezierPoint of bezierPoints) {
    allPoints.push(bezierPoint.position);
    
    const handleIn = getHandleCartesian(bezierPoint, 'in');
    if (handleIn) {
      allPoints.push(handleIn);
    }
    
    const handleOut = getHandleCartesian(bezierPoint, 'out');
    if (handleOut) {
      allPoints.push(handleOut);
    }
  }
  
  let minX = allPoints[0].x;
  let minY = allPoints[0].y;
  let maxX = allPoints[0].x;
  let maxY = allPoints[0].y;
  
  for (let i = 1; i < allPoints.length; i++) {
    const point = allPoints[i];
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  
  return { minX, minY, maxX, maxY };
}

/**
 * Check if bounds A contains bounds B
 */
export function boundsContains(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.minY >= outer.minY &&
    inner.maxX <= outer.maxX &&
    inner.maxY <= outer.maxY
  );
}
