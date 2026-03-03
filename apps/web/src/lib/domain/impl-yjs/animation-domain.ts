/**
 * AnimationDomain - Factory class for creating projects and paths
 * Main entry point for creating animation domain entities
 */

import type { Point, BezierPoint, PolarHandle } from "../coordinate-utils";
import {
  cartesianToPolar as coordCartesianToPolar,
  polarToCartesian as coordPolarToCartesian,
  getHandleCartesian as coordGetHandleCartesian,
} from "../coordinate-utils";
import type { ICubicBezierPath, IClosedCubicBezierPath } from "../interfaces";
import {
  CubicBezierPathAtomic,
  CubicBezierPathGranular,
  ClosedCubicBezierPathAtomic,
  ClosedCubicBezierPathGranular,
} from "./cubic-bezier-path";
import type { IAnimationProject } from "../interfaces";
import { AnimationProject } from "./animation-project";
import * as Y from "yjs";

export interface IAnimationDomain {
  // Path Factories
  createPath(points?: BezierPoint[], closed?: boolean): ICubicBezierPath;
  createClosedPath(points: BezierPoint[]): IClosedCubicBezierPath;
  createMinimalClosedPath(
    center: Point,
    radius: number,
    pointCount?: number
  ): IClosedCubicBezierPath;

  // Project Factory
  createProject(
    name: string,
    options?: Partial<IAnimationProject>
  ): IAnimationProject;

  // Coordinate Utilities
  cartesianToPolar(
    anchorX: number,
    anchorY: number,
    handleX: number,
    handleY: number
  ): PolarHandle;
  polarToCartesian(
    anchorX: number,
    anchorY: number,
    angle: number,
    distance: number
  ): Point;
  getHandleCartesian(
    point: BezierPoint,
    handleType: "in" | "out"
  ): Point | null;
}

export class AnimationDomain implements IAnimationDomain {
  // Path implementation preference
  private useGranularPaths: boolean;

  constructor(
    options?: {
      useGranularPaths?: boolean;
    }
  ) {
    this.useGranularPaths = options?.useGranularPaths ?? false;
  }

  // =========================================================================
  // Path Factories
  // =========================================================================

  createPath(points?: BezierPoint[], closed?: boolean): ICubicBezierPath {
    const ymap = new Y.Map();
    ymap.set("points", points || []);
    ymap.set("closed", closed || false);

    if (this.useGranularPaths) {
      return new CubicBezierPathGranular(ymap);
    } else {
      return new CubicBezierPathAtomic(ymap);
    }
  }

  createClosedPath(points: BezierPoint[]): IClosedCubicBezierPath {
    if (points.length < 3) {
      throw new Error("Closed path requires at least 3 points");
    }

    const ymap = new Y.Map();
    ymap.set("points", points);
    ymap.set("closed", true);

    if (this.useGranularPaths) {
      return new ClosedCubicBezierPathGranular(ymap);
    } else {
      return new ClosedCubicBezierPathAtomic(ymap);
    }
  }

  createMinimalClosedPath(
    center: Point,
    radius: number,
    pointCount: number = 4
  ): IClosedCubicBezierPath {
    if (pointCount < 3) {
      throw new Error("Point count must be at least 3");
    }

    const points: BezierPoint[] = [];
    const angleStep = (2 * Math.PI) / pointCount;

    for (let i = 0; i < pointCount; i++) {
      const angle = i * angleStep;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;

      points.push({
        position: { x, y },
        handleIn: null,
        handleOut: null,
      });
    }

    return this.createClosedPath(points);
  }

  // =========================================================================
  // Project Factory
  // =========================================================================

  createProject(
    name: string,
    options?: Partial<IAnimationProject>
  ): IAnimationProject {
    return new AnimationProject(
      {
        id: crypto.randomUUID(),
        name,
        frameRate: options?.frameRate ?? 30,
        width: options?.width ?? 1920,
        height: options?.height ?? 1080,
        metadata: options?.metadata,
      },
      this.useGranularPaths
    );
  }

  // =========================================================================
  // Coordinate Utilities (Delegate to pure functions)
  // =========================================================================

  cartesianToPolar(
    anchorX: number,
    anchorY: number,
    handleX: number,
    handleY: number
  ): PolarHandle {
    return coordCartesianToPolar(anchorX, anchorY, handleX, handleY);
  }

  polarToCartesian(
    anchorX: number,
    anchorY: number,
    angle: number,
    distance: number
  ): Point {
    return coordPolarToCartesian(anchorX, anchorY, angle, distance);
  }

  getHandleCartesian(
    point: BezierPoint,
    handleType: "in" | "out"
  ): Point | null {
    return coordGetHandleCartesian(point, handleType);
  }
}
