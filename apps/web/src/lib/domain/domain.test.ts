/**
 * Animation Domain - Vitest Test Suite
 * Comprehensive tests for all animation domain functionality
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AnimationDomain } from "./impl-yjs/animation-domain";
import type { BezierPoint } from "./coordinate-utils";

describe("AnimationDomain", () => {
  let domain: AnimationDomain;

  beforeEach(() => {
    domain = new AnimationDomain();
  });

  // ==========================================================================
  // Basic Setup and Project Creation
  // ==========================================================================

  describe("Project Creation", () => {
    it("should create a project with default settings", () => {
      const project = domain.createProject("My Animation");

      expect(project.name).toBe("My Animation");
      expect(project.id).toBeTruthy();
      expect(project.frameRate).toBe(30);
      expect(project.width).toBe(1920);
      expect(project.height).toBe(1080);
    });

    it("should create a project with custom settings", () => {
      const project = domain.createProject("Custom Project", {
        frameRate: 24,
        width: 1280,
        height: 720,
      });

      expect(project.name).toBe("Custom Project");
      expect(project.frameRate).toBe(24);
      expect(project.width).toBe(1280);
      expect(project.height).toBe(720);
    });
  });

  // ==========================================================================
  // Frame Management
  // ==========================================================================

  describe("Frame Management", () => {
    it("should create and add frames to project", () => {
      const project = domain.createProject("Frame Test");
      project.createFrame(0, 0);
      project.createFrame(1, 41.67);

      expect(project.getAllFrames().length).toBe(2);
    });

    it("should get frames sorted by index", () => {
      const project = domain.createProject("Frame Test");
      project.createFrame(2, 83.33);
      project.createFrame(0, 0);
      project.createFrame(1, 41.67);

      const sorted = project.getFramesSortedByIndex();
      expect(sorted[0].index).toBe(0);
      expect(sorted[1].index).toBe(1);
      expect(sorted[2].index).toBe(2);
    });

    it("should get frame by index", () => {
      const project = domain.createProject("Frame Test");
      project.createFrame(1, 41.67);

      const found = project.getFrameByIndex(1);
      expect(found).toBeTruthy();
      expect(found?.index).toBe(1);
    });

    it("should get frame by id", () => {
      const project = domain.createProject("Frame Test");
      const frame = project.createFrame(0, 0);

      const found = project.getFrameById(frame.id);
      expect(found).toBeTruthy();
      expect(found?.id).toBe(frame.id);
    });

    it("should remove frame", () => {
      const project = domain.createProject("Frame Test");
      const frame = project.createFrame(0, 0);

      expect(project.getAllFrames().length).toBe(1);

      const removed = project.removeFrame(frame.id);
      expect(removed).toBe(true);
      expect(project.getAllFrames().length).toBe(0);
    });

    it("should calculate total duration from frame rate", () => {
      const project = domain.createProject("Frame Test", { frameRate: 24 });
      project.createFrame(0, 0);
      project.createFrame(1, 41.67);
      project.createFrame(2, 83.33);

      const duration = project.getTotalDuration();
      expect(duration).toBeCloseTo(125, 0); // 3 frames at 24fps
    });
  });

  // ==========================================================================
  // Bezier Path Creation and Editing
  // ==========================================================================

  describe("Bezier Paths", () => {
    it("should create an open path", () => {
      const path = domain.createPath([], false);

      expect(path.getPointCount()).toBe(0);
      expect(path.isClosed()).toBe(false);
    });

    it("should add points to path", () => {
      const path = domain.createPath();

      path.addPoint({
        position: { x: 100, y: 100 },
        handleIn: null,
        handleOut: null,
      });

      expect(path.getPointCount()).toBe(1);
      expect(path.getPoint(0)?.position).toEqual({ x: 100, y: 100 });
    });

    it("should create a closed path with minimum 3 points", () => {
      const points: BezierPoint[] = [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 50, y: 100 }, handleIn: null, handleOut: null },
      ];

      const path = domain.createClosedPath(points);

      expect(path.getPointCount()).toBe(3);
      expect(path.isClosed()).toBe(true);
    });

    it("should throw error for closed path with < 3 points", () => {
      const points: BezierPoint[] = [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
      ];

      expect(() => domain.createClosedPath(points)).toThrow();
    });

    it("should create a minimal closed path (circle)", () => {
      const circle = domain.createMinimalClosedPath({ x: 400, y: 300 }, 100, 8);

      expect(circle.getPointCount()).toBe(8);
      expect(circle.isClosed()).toBe(true);
    });

    it("should move points", () => {
      const path = domain.createPath([
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
      ]);

      path.movePoint(0, 50, 50);

      expect(path.getPoint(0)?.position).toEqual({ x: 50, y: 50 });
    });

    it("should set handles in polar coordinates", () => {
      const path = domain.createPath([
        { position: { x: 100, y: 100 }, handleIn: null, handleOut: null },
      ]);

      path.setPointHandleOut(0, Math.PI / 4, 50);

      const point = path.getPoint(0);
      expect(point?.handleOut?.angle).toBeCloseTo(Math.PI / 4);
      expect(point?.handleOut?.distance).toBe(50);
    });

    it("should set handles in cartesian coordinates", () => {
      const path = domain.createPath([
        { position: { x: 100, y: 100 }, handleIn: null, handleOut: null },
      ]);

      path.setPointHandleOutCartesian(0, 150, 150);

      const point = path.getPoint(0);
      expect(point?.handleOut).toBeTruthy();
      expect(point?.handleOut?.distance).toBeCloseTo(70.71, 1);
    });

    it("should calculate bounds", () => {
      const path = domain.createClosedPath([
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 100 }, handleIn: null, handleOut: null },
      ]);

      const bounds = path.getBounds();
      expect(bounds.minX).toBe(0);
      expect(bounds.minY).toBe(0);
      expect(bounds.maxX).toBe(100);
      expect(bounds.maxY).toBe(100);
    });

    it("should not allow clearing closed path", () => {
      const path = domain.createClosedPath([
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 50, y: 100 }, handleIn: null, handleOut: null },
      ]);

      expect(() => path.clear()).toThrow();
    });

    it("should not allow removing points below minimum in closed path", () => {
      const path = domain.createClosedPath([
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 50, y: 100 }, handleIn: null, handleOut: null },
      ]);

      const removed = path.removePoint(0);
      expect(removed).toBe(false);
      expect(path.getPointCount()).toBe(3);
    });
  });

  // ==========================================================================
  // Masking Layers and Shapes
  // ==========================================================================

  describe("Masking Layers", () => {
    it("should create a masking layer", () => {
      const project = domain.createProject("Test");
      const layer = project.createMaskingLayer("Character", {
        color: "#FF6B6B",
        visible: true,
        order: 0,
      });

      expect(layer.name).toBe("Character");
      expect(layer.color).toBe("#FF6B6B");
      expect(layer.visible).toBe(true);
      expect(layer.order).toBe(0);
    });

    it("should add masking layer to project", () => {
      const project = domain.createProject("Test");
      project.createMaskingLayer("Layer 1");

      expect(project.getAllMaskingLayers().length).toBe(1);
    });

    it("should create shape for frame", () => {
      const project = domain.createProject("Test");
      const layer = project.createMaskingLayer("Character");
      const frameId = "frame-1";

      const points: BezierPoint[] = [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 50, y: 100 }, handleIn: null, handleOut: null },
      ];

      const shape = layer.createShapeForFrame(frameId, points);

      expect(shape.id).toBeTruthy();
      expect(shape.frameId).toBe(frameId);
      expect(shape.getPath().getPointCount()).toBe(3);
    });

    it("should get shapes for frame", () => {
      const project = domain.createProject("Test");
      const layer = project.createMaskingLayer("Character");
      const frameId = "frame-1";

      const points: BezierPoint[] = [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 50, y: 100 }, handleIn: null, handleOut: null },
      ];

      layer.createShapeForFrame(frameId, points);
      layer.createShapeForFrame(frameId, points);

      const shapes = layer.getShapesForFrame(frameId);
      expect(shapes.length).toBe(2);
    });

    it("should remove shape from frame", () => {
      const project = domain.createProject("Test");
      const layer = project.createMaskingLayer("Character");
      const frameId = "frame-1";

      const points: BezierPoint[] = [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 50, y: 100 }, handleIn: null, handleOut: null },
      ];

      const shape = layer.createShapeForFrame(frameId, points);
      expect(layer.getShapeCountForFrame(frameId)).toBe(1);

      const removed = layer.removeShapeFromFrame(frameId, shape.id);
      expect(removed).toBe(true);
      expect(layer.getShapeCountForFrame(frameId)).toBe(0);
    });

    it("should get total shape count", () => {
      const project = domain.createProject("Test");
      const layer = project.createMaskingLayer("Character");

      const points: BezierPoint[] = [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 50, y: 100 }, handleIn: null, handleOut: null },
      ];

      layer.createShapeForFrame("frame-1", points);
      layer.createShapeForFrame("frame-2", points);
      layer.createShapeForFrame("frame-2", points);

      expect(layer.getTotalShapeCount()).toBe(3);
    });

    it("should get defined frame ids", () => {
      const project = domain.createProject("Test");
      const layer = project.createMaskingLayer("Character");

      const points: BezierPoint[] = [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null },
        { position: { x: 50, y: 100 }, handleIn: null, handleOut: null },
      ];

      layer.createShapeForFrame("frame-1", points);
      layer.createShapeForFrame("frame-3", points);

      const frameIds = layer.getDefinedFrameIds();
      expect(frameIds).toContain("frame-1");
      expect(frameIds).toContain("frame-3");
      expect(frameIds.length).toBe(2);
    });
  });

  // ==========================================================================
  // Lighting Layers
  // ==========================================================================

  describe("Lighting Layers", () => {
    it("should create a lighting layer", () => {
      const project = domain.createProject("Test");
      const maskingLayerId = "masking-layer-1";
      const layer = project.createLightingLayer(maskingLayerId, "Rim Light", {
        blendMode: { type: "add" },
        opacity: 0.8,
      });

      expect(layer.name).toBe("Rim Light");
      expect(layer.maskingLayerId).toBe(maskingLayerId);
      expect(layer.blendMode.type).toBe("add");
      expect(layer.opacity).toBe(0.8);
    });

    it("should create lighting shape for frame", () => {
      const project = domain.createProject("Test");
      const layer = project.createLightingLayer("masking-1", "Light");
      const frameId = "frame-1";

      const innerPath = domain.createMinimalClosedPath(
        { x: 500, y: 400 },
        50,
        6
      );
      const outerPath = domain.createMinimalClosedPath(
        { x: 500, y: 400 },
        120,
        8
      );

      const shape = layer.createShapeForFrame(
        frameId,
        innerPath,
        outerPath,
        "#ffffff",
        {
          intensity: 0.9,
          falloffType: "smooth",
        }
      );

      expect(shape.id).toBeTruthy();
      expect(shape.frameId).toBe(frameId);
      expect(shape.baseColor).toBe("#ffffff");
      expect(shape.intensity).toBe(0.9);
      expect(shape.falloffType).toBe("smooth");
    });

    it("should validate lighting shape bounds", () => {
      const project = domain.createProject("Test");
      const layer = project.createLightingLayer("masking-1", "Light");
      const frameId = "frame-1";

      const innerPath = domain.createMinimalClosedPath(
        { x: 500, y: 400 },
        50,
        6
      );
      const outerPath = domain.createMinimalClosedPath(
        { x: 500, y: 400 },
        120,
        8
      );

      const shape = layer.createShapeForFrame(
        frameId,
        innerPath,
        outerPath,
        "#ffffff"
      );

      expect(shape.isValid()).toBe(true);
    });

    it("should clamp intensity to [0, 1]", () => {
      const project = domain.createProject("Test");
      const layer = project.createLightingLayer("masking-1", "Light");
      const frameId = "frame-1";

      const innerPath = domain.createMinimalClosedPath(
        { x: 500, y: 400 },
        50,
        6
      );
      const outerPath = domain.createMinimalClosedPath(
        { x: 500, y: 400 },
        120,
        8
      );

      const shape = layer.createShapeForFrame(
        frameId,
        innerPath,
        outerPath,
        "#ffffff",
        { intensity: 1.5 }
      );

      expect(shape.intensity).toBe(1.0);

      shape.intensity = -0.5;
      expect(shape.intensity).toBe(0.0);
    });

    it("should get lighting layers for masking layer", () => {
      const project = domain.createProject("Test");
      const maskingLayer = project.createMaskingLayer("Character");

      project.createLightingLayer(maskingLayer.id, "Light 1");
      project.createLightingLayer(maskingLayer.id, "Light 2");

      const lights = project.getLightingLayersForMask(maskingLayer.id);
      expect(lights.length).toBe(2);
    });
  });

  // ==========================================================================
  // Basic Undo/Redo
  // ==========================================================================

  describe("Basic Undo/Redo", () => {
    it("should undo single operation", () => {
      const project = domain.createProject("Test");
      project.createMaskingLayer("Layer 1");

      expect(project.getAllMaskingLayers().length).toBe(1);

      project.undo();
      expect(project.getAllMaskingLayers().length).toBe(0);
    });

    it("should redo single operation", () => {
      const project = domain.createProject("Test");
      project.createMaskingLayer("Layer 1");

      project.undo();
      expect(project.getAllMaskingLayers().length).toBe(0);

      project.redo();
      expect(project.getAllMaskingLayers().length).toBe(1);
    });

    it("should track undo/redo state", () => {
      const project = domain.createProject("Test");

      expect(project.canUndo()).toBe(false);
      expect(project.canRedo()).toBe(false);

      project.createMaskingLayer("Layer 1");

      expect(project.canUndo()).toBe(true);
      expect(project.canRedo()).toBe(false);

      project.undo();

      expect(project.canUndo()).toBe(false);
      expect(project.canRedo()).toBe(true);
    });

    it("should provide undo/redo state", () => {
      const project = domain.createProject("Test");
      project.createMaskingLayer("Layer 1");

      const state = project.getUndoRedoState();
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
      expect(state.undoStackSize).toBe(1);
      expect(state.redoStackSize).toBe(0);
    });
  });

  // ==========================================================================
  // Transactions
  // ==========================================================================

  describe("Transactions", () => {
    it("should group multiple operations into one transaction", () => {
      const project = domain.createProject("Test");

      project.beginTransaction("Setup scene");

      project.createFrame(0, 0);
      project.createFrame(1, 41.67);

      project.createMaskingLayer("Layer 1");
      project.createMaskingLayer("Layer 2");

      project.commitTransaction();

      expect(project.getAllFrames().length).toBe(2);
      expect(project.getAllMaskingLayers().length).toBe(2);
      expect(project.getTransactionHistory().length).toBe(1);

      // Undo entire transaction
      project.undo();

      expect(project.getAllFrames().length).toBe(0);
      expect(project.getAllMaskingLayers().length).toBe(0);
    });

    it("should not allow nested transactions", () => {
      const project = domain.createProject("Test");

      project.beginTransaction("First");

      expect(() => {
        project.beginTransaction("Second");
      }).toThrow();

      project.commitTransaction();
    });

    it("should rollback transaction on error", () => {
      const project = domain.createProject("Test");

      project.beginTransaction("Batch operation");

      project.createMaskingLayer("Layer 1");
      expect(project.getAllMaskingLayers().length).toBe(1);

      project.createMaskingLayer("Layer 2");
      expect(project.getAllMaskingLayers().length).toBe(2);

      // Rollback
      project.rollbackTransaction();

      expect(project.getAllMaskingLayers().length).toBe(0);
    });

    it("should check if in transaction", () => {
      const project = domain.createProject("Test");

      expect(project.isInTransaction()).toBe(false);

      project.beginTransaction("Test");
      expect(project.isInTransaction()).toBe(true);

      project.commitTransaction();
      expect(project.isInTransaction()).toBe(false);
    });
  });

  // ==========================================================================
  // Undo/Redo State Subscription
  // ==========================================================================

  describe("Undo/Redo Subscription", () => {
    it("should call callback on state change", () => {
      const project = domain.createProject("Test");
      const callback = vi.fn();

      const unsubscribe = project.onUndoRedoStateChange(callback);

      // Should be called immediately
      expect(callback).toHaveBeenCalledTimes(1);

      project.createMaskingLayer("Layer 1");

      expect(callback).toHaveBeenCalledTimes(2);

      unsubscribe();
    });

    it("should unsubscribe correctly", () => {
      const project = domain.createProject("Test");
      const callback = vi.fn();

      const unsubscribe = project.onUndoRedoStateChange(callback);
      callback.mockClear();

      project.createMaskingLayer("Layer 1");
      expect(callback).toHaveBeenCalled();

      unsubscribe();
      callback.mockClear();

      project.createMaskingLayer("Layer 2");
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Coordinate Utilities
  // ==========================================================================

  describe("Coordinate Utilities", () => {
    it("should convert cartesian to polar", () => {
      const polar = domain.cartesianToPolar(100, 100, 150, 150);

      expect(polar.angle).toBeCloseTo(Math.PI / 4);
      expect(polar.distance).toBeCloseTo(70.71, 1);
    });

    it("should convert polar to cartesian", () => {
      const cartesian = domain.polarToCartesian(100, 100, Math.PI / 4, 70.71);

      expect(cartesian.x).toBeCloseTo(150, 0);
      expect(cartesian.y).toBeCloseTo(150, 0);
    });

    it("should get handle cartesian position", () => {
      const point: BezierPoint = {
        position: { x: 200, y: 200 },
        handleIn: { angle: Math.PI, distance: 50 },
        handleOut: { angle: 0, distance: 50 },
      };

      const handleIn = domain.getHandleCartesian(point, "in");
      const handleOut = domain.getHandleCartesian(point, "out");

      expect(handleIn?.x).toBeCloseTo(150, 0);
      expect(handleIn?.y).toBeCloseTo(200, 0);
      expect(handleOut?.x).toBeCloseTo(250, 0);
      expect(handleOut?.y).toBeCloseTo(200, 0);
    });

    it("should return null for missing handles", () => {
      const point: BezierPoint = {
        position: { x: 200, y: 200 },
        handleIn: null,
        handleOut: null,
      };

      const handleIn = domain.getHandleCartesian(point, "in");
      const handleOut = domain.getHandleCartesian(point, "out");

      expect(handleIn).toBeNull();
      expect(handleOut).toBeNull();
    });
  });

  // ==========================================================================
  // Complete Workflow Integration Test
  // ==========================================================================

  describe("Complete Workflow", () => {
    it("should handle complete animation workflow", () => {
      // Create project
      const project = domain.createProject("Character Animation", {
        frameRate: 24,
        width: 1920,
        height: 1080,
      });

      // Create frames
      project.beginTransaction("Create frames");
      for (let i = 0; i < 5; i++) {
        project.createFrame(i, (i * 1000) / 24);
      }
      project.commitTransaction();

      expect(project.getAllFrames().length).toBe(5);

      // Create masking layer
      const character = project.createMaskingLayer("Character", {
        color: "#4ECDC4",
      });

      // Create shapes for each frame
      project.beginTransaction("Create character shapes");
      const frames = project.getFramesSortedByIndex();

      frames.forEach((frame, index) => {
        const centerX = 500 + index * 100;
        const circle = domain.createMinimalClosedPath(
          { x: centerX, y: 400 },
          80,
          8
        );
        character.createShapeForFrameFromPath(frame.id, circle);
      });
      project.commitTransaction();

      expect(character.getTotalShapeCount()).toBe(5);

      // Create lighting
      const rimLight = project.createLightingLayer(character.id, "Rim Light", {
        blendMode: { type: "add" },
        opacity: 0.7,
      });

      // Add lighting to first frame
      const firstFrame = frames[0];
      const innerPath = domain.createMinimalClosedPath(
        { x: 500, y: 400 },
        50,
        6
      );
      const outerPath = domain.createMinimalClosedPath(
        { x: 500, y: 400 },
        120,
        8
      );

      rimLight.createShapeForFrame(
        firstFrame.id,
        innerPath,
        outerPath,
        "#ffffff",
        {
          intensity: 0.8,
          falloffType: "smooth",
        }
      );

      // Verify final state
      expect(project.getAllFrames().length).toBe(5);
      expect(project.getAllMaskingLayers().length).toBe(1);
      expect(project.getAllLightingLayers().length).toBe(1);
      expect(character.getTotalShapeCount()).toBe(5);
      expect(rimLight.getTotalShapeCount()).toBe(1);

      // Test undo
      project.undo(); // Undo lighting creation
      expect(rimLight.getTotalShapeCount()).toBe(0);

      project.undo(); // Undo all character shapes
      expect(character.getTotalShapeCount()).toBe(0);

      project.undo(); // Undo frames
      expect(project.getAllFrames().length).toBe(0);

      // Test redo
      project.redo(); // Redo frames
      expect(project.getAllFrames().length).toBe(5);

      project.redo(); // Redo character shapes
      expect(character.getTotalShapeCount()).toBe(5);

      project.redo(); // Redo lighting
      expect(rimLight.getTotalShapeCount()).toBe(1);
    });
  });
});
