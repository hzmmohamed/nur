import { assign } from "xstate";
import { penToolMachine } from "./machine";
import { fromCallback } from "xstate";
import Konva from "konva";

// Renderer actor using Konva instead of canvas API
export const rendererActor = fromCallback(({ receive, input }) => {
  const { layer } = input;
  let currentState = null;

  // Keep track of Konva objects for efficient updates
  let pathObjects = new Map(); // pathId -> Konva.Path
  let controlObjects = new Map(); // controlId -> Konva object
  let previewObjects = new Map(); // preview objects

  // Helper function to convert path points to SVG path data
  const pathToSVG = (path) => {
    if (!path || path.points.length === 0) return "";

    let svgPath = "";
    const points = path.points;

    // Move to first point
    svgPath += `M ${points[0].x} ${points[0].y}`;

    // Draw curves/lines between points
    for (let i = 1; i < points.length; i++) {
      const currentPoint = points[i];
      const previousPoint = points[i - 1];

      if (previousPoint.handleOut || currentPoint.handleIn) {
        // Bezier curve
        const cp1x =
          previousPoint.x +
          (previousPoint.handleOut ? previousPoint.handleOut.x : 0);
        const cp1y =
          previousPoint.y +
          (previousPoint.handleOut ? previousPoint.handleOut.y : 0);
        const cp2x =
          currentPoint.x +
          (currentPoint.handleIn ? currentPoint.handleIn.x : 0);
        const cp2y =
          currentPoint.y +
          (currentPoint.handleIn ? currentPoint.handleIn.y : 0);

        svgPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${currentPoint.x} ${currentPoint.y}`;
      } else {
        // Straight line
        svgPath += ` L ${currentPoint.x} ${currentPoint.y}`;
      }
    }

    // Close path if needed
    if (path.closed && points.length > 2) {
      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];

      if (lastPoint.handleOut || firstPoint.handleIn) {
        // Bezier curve back to start
        const cp1x =
          lastPoint.x + (lastPoint.handleOut ? lastPoint.handleOut.x : 0);
        const cp1y =
          lastPoint.y + (lastPoint.handleOut ? lastPoint.handleOut.y : 0);
        const cp2x =
          firstPoint.x + (firstPoint.handleIn ? firstPoint.handleIn.x : 0);
        const cp2y =
          firstPoint.y + (firstPoint.handleIn ? firstPoint.handleIn.y : 0);

        svgPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${firstPoint.x} ${firstPoint.y}`;
      } else {
        // Straight line back to start
        svgPath += ` L ${firstPoint.x} ${firstPoint.y}`;
      }
      svgPath += " Z";
    }

    return svgPath;
  };

  // Helper function to create or update a path object
  const updatePath = (path, pathId, isSelected = false, isPreview = false) => {
    const konvaPathId = isPreview ? "preview" : `path_${pathId}`;
    const svgData = pathToSVG(path);

    if (!svgData) return;

    let pathObject = pathObjects.get(konvaPathId);

    if (!pathObject) {
      pathObject = new Konva.Path({
        data: svgData,
        stroke: isSelected ? "#f59e0b" : "#3b82f6",
        strokeWidth: 2,
        lineCap: "round",
        lineJoin: "round",
        fill: path.closed ? "rgba(59, 130, 246, 0.1)" : undefined,
        dash: isPreview ? [5, 5] : undefined,
      });
      layer.add(pathObject);
      pathObjects.set(konvaPathId, pathObject);
    } else {
      pathObject.setAttrs({
        data: svgData,
        stroke: isSelected ? "#f59e0b" : "#3b82f6",
        fill: path.closed ? "rgba(59, 130, 246, 0.1)" : undefined,
        dash: isPreview ? [5, 5] : undefined,
      });
    }
  };

  // Helper function to create preview path
  const updatePreviewPath = (path, previewPoint) => {
    if (!path || !previewPoint || path.points.length === 0) {
      // Remove preview if it exists
      const previewPath = pathObjects.get("preview_line");
      if (previewPath) {
        previewPath.destroy();
        pathObjects.delete("preview_line");
      }
      return;
    }

    // Create a temporary path with the preview point
    const tempPath = {
      ...path,
      points: [...path.points, previewPoint],
      closed: false,
    };

    const svgData = pathToSVG(tempPath);
    let previewPath = pathObjects.get("preview_line");

    if (!previewPath) {
      previewPath = new Konva.Path({
        data: svgData,
        stroke: "#3b82f6",
        strokeWidth: 2,
        dash: [5, 5],
        fill: undefined,
      });
      layer.add(previewPath);
      pathObjects.set("preview_line", previewPath);
    } else {
      previewPath.setAttrs({
        data: svgData,
      });
    }
  };

  // Helper function to create/update control points and handles
  const updateControls = (path, pathId, selectedPoint, selectedHandle) => {
    if (!path) return;

    // Clear existing controls for this path
    const controlPrefix = `controls_${pathId}`;
    for (let [key, obj] of controlObjects) {
      if (key.startsWith(controlPrefix)) {
        obj.destroy();
        controlObjects.delete(key);
      }
    }

    path.points.forEach((point, pointIndex) => {
      const pointId = `${controlPrefix}_point_${pointIndex}`;
      const handleInId = `${controlPrefix}_handleIn_${pointIndex}`;
      const handleOutId = `${controlPrefix}_handleOut_${pointIndex}`;
      const lineInId = `${controlPrefix}_lineIn_${pointIndex}`;
      const lineOutId = `${controlPrefix}_lineOut_${pointIndex}`;

      // Draw handle lines
      if (point.handleIn) {
        const line = new Konva.Line({
          points: [
            point.x,
            point.y,
            point.x + point.handleIn.x,
            point.y + point.handleIn.y,
          ],
          stroke: "#666",
          strokeWidth: 1,
        });
        layer.add(line);
        controlObjects.set(lineInId, line);
      }

      if (point.handleOut) {
        const line = new Konva.Line({
          points: [
            point.x,
            point.y,
            point.x + point.handleOut.x,
            point.y + point.handleOut.y,
          ],
          stroke: "#666",
          strokeWidth: 1,
        });
        layer.add(line);
        controlObjects.set(lineOutId, line);
      }

      // Draw handle points
      if (point.handleIn) {
        const handleX = point.x + point.handleIn.x;
        const handleY = point.y + point.handleIn.y;
        const isSelectedHandle =
          selectedHandle?.pathId === pathId &&
          selectedHandle?.pointIndex === pointIndex &&
          selectedHandle?.handle === "in";

        const handle = new Konva.Circle({
          x: handleX,
          y: handleY,
          radius: 3,
          fill: isSelectedHandle ? "#f59e0b" : "#666",
          stroke: "white",
          strokeWidth: 1,
        });
        layer.add(handle);
        controlObjects.set(handleInId, handle);
      }

      if (point.handleOut) {
        const handleX = point.x + point.handleOut.x;
        const handleY = point.y + point.handleOut.y;
        const isSelectedHandle =
          selectedHandle?.pathId === pathId &&
          selectedHandle?.pointIndex === pointIndex &&
          selectedHandle?.handle === "out";

        const handle = new Konva.Circle({
          x: handleX,
          y: handleY,
          radius: 3,
          fill: isSelectedHandle ? "#f59e0b" : "#666",
          stroke: "white",
          strokeWidth: 1,
        });
        layer.add(handle);
        controlObjects.set(handleOutId, handle);
      }

      // Draw main control point
      const isSelectedPoint =
        selectedPoint?.pathId === pathId &&
        selectedPoint?.pointIndex === pointIndex;

      const controlPoint = new Konva.Circle({
        x: point.x,
        y: point.y,
        radius: 4,
        fill: isSelectedPoint ? "#f59e0b" : "#3b82f6",
        stroke: "white",
        strokeWidth: 2,
      });
      layer.add(controlPoint);
      controlObjects.set(pointId, controlPoint);

      // First point indicator for open paths
      if (pointIndex === 0 && !path.closed) {
        const indicator = new Konva.Circle({
          x: point.x,
          y: point.y,
          radius: 6,
          stroke: "#10b981",
          strokeWidth: 2,
          dash: [2, 2],
        });
        layer.add(indicator);
        controlObjects.set(`${pointId}_indicator`, indicator);
      }
    });
  };

  // Clear all objects from layer
  const clearAll = () => {
    // Destroy all path objects
    for (let [key, obj] of pathObjects) {
      obj.destroy();
    }
    pathObjects.clear();

    // Destroy all control objects
    for (let [key, obj] of controlObjects) {
      obj.destroy();
    }
    controlObjects.clear();

    // Destroy all preview objects
    for (let [key, obj] of previewObjects) {
      obj.destroy();
    }
    previewObjects.clear();
  };

  // Main render function
  const render = (state) => {
    const {
      projectManager,
      layerId,
      frameId,
      currentPathId,
      selectedPathId,
      selectedPoint,
      selectedHandle,
      tool,
      previewPoint,
    } = state.context;

    // Clear existing objects
    clearAll();

    // Get all completed paths from the project manager
    const paths = projectManager.getLayerFrameMasks(layerId, frameId);

    // Render completed paths
    paths.forEach((path) => {
      updatePath(path, path.id, selectedPathId === path.id);

      if (
        (tool === "select" || selectedPathId === path.id) &&
        (selectedPathId === path.id || tool === "select")
      ) {
        updateControls(path, path.id, selectedPoint, selectedHandle);
      }
    });

    // Render current path being drawn
    if (currentPathId) {
      const currentPath = projectManager.getCurrentPath(layerId, frameId);

      if (currentPath) {
        if (previewPoint) {
          updatePreviewPath(currentPath, previewPoint);
        } else {
          updatePath(currentPath, currentPath.id, false, true);
        }
        updateControls(
          currentPath,
          currentPath.id,
          selectedPoint,
          selectedHandle
        );
      }
    }

    // Redraw the layer
    layer.batchDraw();
  };

  receive((event) => {
    if (event.type === "RENDER") {
      currentState = event.state;
      render(currentState);
    }
  });

  return () => {
    // Cleanup - destroy all objects
    clearAll();
  };
});

export const PenToolMachine = penToolMachine.provide({
  actors: {
    rendererActor,
  },
  actions: {
    setTool: assign({
      tool: ({ event }) => event.tool,
    }),

    startNewPath: assign(({ context, event }) => {
      const pathId = context.projectManager.setCurrentPath(
        context.layerId,
        context.frameId,
        {
          points: [
            {
              x: event.point.x,
              y: event.point.y,
              handleIn: null,
              handleOut: null,
            },
          ],
          closed: false,
        }
      );

      return {
        currentPathId: pathId,
        selectedPoint: { pathId, pointIndex: 0 },
        dragStart: event.point,
      };
    }),

    addPointToCurrentPath: assign(({ context, event }) => {
      if (!context.currentPathId) return {};

      const currentPath = context.projectManager.getCurrentPath(
        context.layerId,
        context.frameId
      );

      if (!currentPath) return {};

      context.projectManager.addPointToPath(
        context.layerId,
        context.frameId,
        context.currentPathId,
        {
          x: event.point.x,
          y: event.point.y,
          handleIn: null,
          handleOut: null,
        }
      );

      return {
        selectedPoint: {
          pathId: context.currentPathId,
          pointIndex: currentPath.points.length,
        },
        dragStart: event.point,
      };
    }),

    closeCurrentPath: assign(({ context }) => {
      if (!context.currentPathId) return {};

      context.projectManager.updatePath(
        context.layerId,
        context.frameId,
        context.currentPathId,
        { closed: true }
      );

      // Convert current path to a finalized path
      context.projectManager.clearCurrentPath(context.layerId, context.frameId);

      return {
        selectedPathId: context.currentPathId,
        currentPathId: null,
        selectedPoint: null,
      };
    }),

    finishCurrentPath: assign(({ context }) => {
      if (!context.currentPathId) return {};

      // Mark path as complete and clear current
      context.projectManager.clearCurrentPath(context.layerId, context.frameId);

      return {
        selectedPathId: context.currentPathId,
        currentPathId: null,
        selectedPoint: null,
        previewPoint: null,
      };
    }),

    createCurveHandles: assign(({ context, event }) => {
      if (!context.currentPathId || !context.selectedPoint) return {};

      const handleLength = distance(context.dragStart, event.point);
      const handleAngle = angle(context.dragStart, event.point);

      if (handleLength > 5) {
        const handles = createSymmetricHandle(
          context.dragStart,
          handleAngle,
          handleLength
        );

        context.projectManager.updatePointInPath(
          context.layerId,
          context.frameId,
          context.currentPathId,
          context.selectedPoint.pointIndex,
          {
            handleIn: handles.handleIn,
            handleOut: handles.handleOut,
          }
        );
      }

      return {};
    }),

    selectPoint: assign(({ context, event }) => {
      const allPaths = context.projectManager.getLayerFrameMasks(
        context.layerId,
        context.frameId
      );

      // Check current path first
      const currentPath = context.projectManager.getCurrentPath(
        context.layerId,
        context.frameId
      );

      if (currentPath) {
        allPaths.push(currentPath);
      }

      // Find closest point
      for (const path of allPaths) {
        for (let i = 0; i < path.points.length; i++) {
          if (distance(event.point, path.points[i]) < 10) {
            context.projectManager.setUserSelection(context.userId, {
              layerId: context.layerId,
              frameId: context.frameId,
              pathId: path.id,
              pointIndex: i,
            });

            return {
              selectedPathId: path.id,
              selectedPoint: {
                pathId: path.id,
                pointIndex: i,
              },
              selectedHandle: null,
              dragStart: event.point,
            };
          }
        }
      }
      return {};
    }),

    selectHandle: assign(({ context, event }) => {
      const allPaths = context.projectManager.getLayerFrameMasks(
        context.layerId,
        context.frameId
      );

      const currentPath = context.projectManager.getCurrentPath(
        context.layerId,
        context.frameId
      );

      if (currentPath) {
        allPaths.push(currentPath);
      }

      // Find closest handle
      for (const path of allPaths) {
        for (let i = 0; i < path.points.length; i++) {
          const p = path.points[i];

          if (p.handleOut) {
            const handlePos = {
              x: p.x + p.handleOut.x,
              y: p.y + p.handleOut.y,
            };
            if (distance(event.point, handlePos) < 8) {
              return {
                selectedPathId: path.id,
                selectedHandle: {
                  pathId: path.id,
                  pointIndex: i,
                  handle: "out" as const,
                },
                dragStart: event.point,
              };
            }
          }

          if (p.handleIn) {
            const handlePos = { x: p.x + p.handleIn.x, y: p.y + p.handleIn.y };
            if (distance(event.point, handlePos) < 8) {
              return {
                selectedPathId: path.id,
                selectedHandle: {
                  pathId: path.id,
                  pointIndex: i,
                  handle: "in" as const,
                },
                dragStart: event.point,
              };
            }
          }
        }
      }
      return {};
    }),

    movePoint: assign(({ context, event }) => {
      if (!context.selectedPoint) return {};

      const path = context.projectManager.getPathById(
        context.layerId,
        context.frameId,
        context.selectedPoint.pathId
      );

      if (!path) return {};

      const dx = event.point.x - context.dragStart.x;
      const dy = event.point.y - context.dragStart.y;
      const point = path.points[context.selectedPoint.pointIndex];

      context.projectManager.updatePointInPath(
        context.layerId,
        context.frameId,
        context.selectedPoint.pathId,
        context.selectedPoint.pointIndex,
        {
          x: point.x + dx,
          y: point.y + dy,
        }
      );

      return {
        dragStart: event.point,
      };
    }),

    moveHandle: assign(({ context, event }) => {
      if (!context.selectedHandle) return {};

      const dx = event.point.x - context.dragStart.x;
      const dy = event.point.y - context.dragStart.y;
      const handlePos = { x: dx, y: dy };

      const updates: Partial<BezierPoint> = {};

      if (context.selectedHandle.handle === "out") {
        updates.handleOut = handlePos;
        if (!event.altKey) {
          updates.handleIn = { x: -handlePos.x, y: -handlePos.y };
        }
      } else {
        updates.handleIn = handlePos;
        if (!event.altKey) {
          updates.handleOut = { x: -handlePos.x, y: -handlePos.y };
        }
      }

      context.projectManager.updatePointInPath(
        context.layerId,
        context.frameId,
        context.selectedHandle.pathId,
        context.selectedHandle.pointIndex,
        updates
      );

      return {};
    }),

    updatePreview: assign({
      previewPoint: ({ event }) => event.point,
    }),

    clearPreview: assign({
      previewPoint: () => null,
    }),

    clearSelection: assign(({ context }) => {
      context.projectManager.clearUserSelection(context.userId);

      return {
        selectedPathId: null,
        selectedPoint: null,
        selectedHandle: null,
      };
    }),

    deleteSelectedPoint: assign(({ context }) => {
      if (!context.selectedPathId || !context.selectedPoint) return {};

      const path = context.projectManager.getPathById(
        context.layerId,
        context.frameId,
        context.selectedPathId
      );

      if (!path) return {};

      if (path.points.length > 1) {
        context.projectManager.removePointFromPath(
          context.layerId,
          context.frameId,
          context.selectedPathId,
          context.selectedPoint.pointIndex
        );

        return {
          selectedPoint: null,
        };
      } else {
        context.projectManager.removePath(
          context.layerId,
          context.frameId,
          context.selectedPathId
        );

        return {
          selectedPoint: null,
          selectedPathId: null,
        };
      }
    }),

    deleteSelectedPath: assign(({ context }) => {
      if (!context.selectedPathId) return {};

      context.projectManager.removePath(
        context.layerId,
        context.frameId,
        context.selectedPathId
      );

      return {
        selectedPathId: null,
        selectedPoint: null,
        selectedHandle: null,
      };
    }),

    clearAll: assign(({ context }) => {
      const allPaths = context.projectManager.getLayerFrameMasks(
        context.layerId,
        context.frameId
      );

      // Remove all paths
      for (const path of allPaths) {
        context.projectManager.removePath(
          context.layerId,
          context.frameId,
          path.id
        );
      }

      // Clear current path
      context.projectManager.clearCurrentPath(context.layerId, context.frameId);

      return {
        currentPathId: null,
        selectedPathId: null,
        selectedPoint: null,
        selectedHandle: null,
        previewPoint: null,
      };
    }),

    render: ({ context, self }) => {
      self.system.get("renderer")?.send({ type: "RENDER", state: { context } });
    },
  },

  guards: {
    isFirstPointClick: ({ context, event }) => {
      const currentPath = context.projectManager.getCurrentPath(
        context.layerId,
        context.frameId
      );

      if (!currentPath || currentPath.points.length === 0) return false;

      const firstPoint = currentPath.points[0];
      return distance(event.point, firstPoint) < 10;
    },

    isExistingPointClick: ({ context, event }) => {
      const currentPath = context.projectManager.getCurrentPath(
        context.layerId,
        context.frameId
      );

      if (!currentPath) return false;

      return currentPath.points.some((p) => distance(event.point, p) < 10);
    },

    isHandleClick: ({ context, event }) => {
      const allPaths = context.projectManager.getLayerFrameMasks(
        context.layerId,
        context.frameId
      );

      const currentPath = context.projectManager.getCurrentPath(
        context.layerId,
        context.frameId
      );

      if (currentPath) {
        allPaths.push(currentPath);
      }

      for (const path of allPaths) {
        for (let i = 0; i < path.points.length; i++) {
          const p = path.points[i];
          if (p.handleOut) {
            const handlePos = {
              x: p.x + p.handleOut.x,
              y: p.y + p.handleOut.y,
            };
            if (distance(event.point, handlePos) < 8) return true;
          }
          if (p.handleIn) {
            const handlePos = { x: p.x + p.handleIn.x, y: p.y + p.handleIn.y };
            if (distance(event.point, handlePos) < 8) return true;
          }
        }
      }
      return false;
    },

    isPointClick: ({ context, event }) => {
      const allPaths = context.projectManager.getLayerFrameMasks(
        context.layerId,
        context.frameId
      );

      const currentPath = context.projectManager.getCurrentPath(
        context.layerId,
        context.frameId
      );

      if (currentPath) {
        allPaths.push(currentPath);
      }

      for (const path of allPaths) {
        if (path.points.some((p) => distance(event.point, p) < 10)) return true;
      }
      return false;
    },

    hasSelectedPoint: ({ context }) => context.selectedPoint !== null,
    hasSelectedPath: ({ context }) => context.selectedPathId !== null,
  },
});
