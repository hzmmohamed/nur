import type Konva from "konva";
import type { KonvaEventListener } from "konva/lib/Node";
import type { Stage } from "konva/lib/Stage";
import { assign, setup, fromCallback, log } from "xstate";
import * as Y from "yjs";

// Types
interface Point {
  x: number;
  y: number;
}

interface BezierPoint {
  x: number;
  y: number;
  handleIn: { x: number; y: number } | null;
  handleOut: { x: number; y: number } | null;
}

interface Path {
  id: string;
  points: BezierPoint[];
  closed: boolean;
}

// Helper functions
const distance = (p1: Point, p2: Point) =>
  Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

const angle = (p1: Point, p2: Point) => Math.atan2(p2.y - p1.y, p2.x - p1.x);

const createSymmetricHandle = (
  _: Point,
  handleDirection: number,
  length: number
) => {
  const handleOut = {
    x: Math.cos(handleDirection) * length,
    y: Math.sin(handleDirection) * length,
  };
  const handleIn = {
    x: -handleOut.x,
    y: -handleOut.y,
  };
  return { handleIn, handleOut };
};

// Helper functions to work with Yjs
const getPathsFromYjs = (yjsDoc: Y.Doc): Path[] => {
  const pathsArray = yjsDoc.getArray("paths");
  return pathsArray.toArray().map((pathMap) => ({
    id: pathMap.get("id"),
    closed: pathMap.get("closed"),
    points: pathMap
      .get("points")
      .toArray()
      .map((pointMap) => ({
        x: pointMap.get("x"),
        y: pointMap.get("y"),
        handleIn: pointMap.get("handleIn")?.toJSON() || null,
        handleOut: pointMap.get("handleOut")?.toJSON() || null,
      })),
  }));
};

const addPathToYjs = (yjsDoc: Y.Doc, path: Path) => {
  const pathsArray = yjsDoc.getArray("paths");
  const pathMap = new Y.Map();

  pathMap.set("id", path.id);
  pathMap.set("closed", path.closed);

  const pointsArray = new Y.Array();
  path.points.forEach((point) => {
    const pointMap = new Y.Map();
    pointMap.set("x", point.x);
    pointMap.set("y", point.y);

    if (point.handleIn) {
      const handleInMap = new Y.Map();
      handleInMap.set("x", point.handleIn.x);
      handleInMap.set("y", point.handleIn.y);
      pointMap.set("handleIn", handleInMap);
    }

    if (point.handleOut) {
      const handleOutMap = new Y.Map();
      handleOutMap.set("x", point.handleOut.x);
      handleOutMap.set("y", point.handleOut.y);
      pointMap.set("handleOut", handleOutMap);
    }

    pointsArray.push([pointMap]);
  });

  pathMap.set("points", pointsArray);
  pathsArray.push([pathMap]);
};

const updatePathInYjs = (
  yjsDoc: Y.Doc,
  pathIndex: number,
  updates: Partial<Path>
) => {
  const pathsArray = yjsDoc.getArray("paths");
  const pathMap = pathsArray.get(pathIndex) as Y.Map<any>;

  Object.entries(updates).forEach(([key, value]) => {
    if (key === "points" && Array.isArray(value)) {
      const pointsArray = new Y.Array();
      value.forEach((point) => {
        const pointMap = new Y.Map();
        pointMap.set("x", point.x);
        pointMap.set("y", point.y);

        if (point.handleIn) {
          const handleInMap = new Y.Map();
          handleInMap.set("x", point.handleIn.x);
          handleInMap.set("y", point.handleIn.y);
          pointMap.set("handleIn", handleInMap);
        }

        if (point.handleOut) {
          const handleOutMap = new Y.Map();
          handleOutMap.set("x", point.handleOut.x);
          handleOutMap.set("y", point.handleOut.y);
          pointMap.set("handleOut", handleOutMap);
        }

        pointsArray.push([pointMap]);
      });
      pathMap.set("points", pointsArray);
    } else {
      pathMap.set(key, value);
    }
  });
};

const removePathFromYjs = (yjsDoc: Y.Doc, pathIndex: number) => {
  const pathsArray = yjsDoc.getArray("paths");
  pathsArray.delete(pathIndex, 1);
};

const clearAllPathsFromYjs = (yjsDoc: Y.Doc) => {
  const pathsArray = yjsDoc.getArray("paths");
  pathsArray.delete(0, pathsArray.length);
};

// Canvas event handler actor (unchanged)
const canvasEventActor = fromCallback<{ type: "" }, { layer: Konva.Layer }>(
  ({ sendBack, input }) => {
    const { layer } = input;
    const stage = layer.getStage();

    const handleMouseDown: KonvaEventListener<Stage, MouseEvent> = (e) => {
      const point = e.target.getRelativePointerPosition();
      sendBack({
        type: "MOUSE_DOWN",
        point,
        altKey: e.evt.altKey,
        shiftKey: e.evt.shiftKey,
      });
    };

    const handleMouseMove: KonvaEventListener<Stage, MouseEvent> = (e) => {
      const point = e.target.getRelativePointerPosition();
      sendBack({
        type: "MOUSE_MOVE",
        point,
        altKey: e.evt.altKey,
        shiftKey: e.evt.shiftKey,
      });
    };

    const handleMouseUp: KonvaEventListener<Stage, MouseEvent> = () => {
      sendBack({ type: "MOUSE_UP" });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          sendBack({ type: "UNDO" });
        } else if (e.key === "y") {
          e.preventDefault();
          sendBack({ type: "REDO" });
        }
      } else {
        sendBack({ type: "KEY_PRESS", key: e.key });
      }
    };

    stage.on("mousemove", handleMouseMove);
    stage.on("mouseup", handleMouseUp);
    stage.on("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      stage.off("mousemove", handleMouseMove);
      stage.off("mouseup", handleMouseUp);
      stage.off("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }
);

// Updated renderer actor that reads from Yjs
const rendererActor = fromCallback(({ receive, input }) => {
  const { layer } = input;
  let currentState = null;

  // Keep track of Konva objects for efficient updates
  let pathObjects = new Map();
  let controlObjects = new Map();
  let previewObjects = new Map();

  // Helper function to convert path points to SVG path data
  const pathToSVG = (path) => {
    if (!path || path.points.length === 0) return "";

    let svgPath = "";
    const points = path.points;

    svgPath += `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const currentPoint = points[i];
      const previousPoint = points[i - 1];

      if (previousPoint.handleOut || currentPoint.handleIn) {
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
        svgPath += ` L ${currentPoint.x} ${currentPoint.y}`;
      }
    }

    if (path.closed && points.length > 2) {
      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];

      if (lastPoint.handleOut || firstPoint.handleIn) {
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
        svgPath += ` L ${firstPoint.x} ${firstPoint.y}`;
      }
      svgPath += " Z";
    }

    return svgPath;
  };

  const updatePath = (
    path,
    pathIndex,
    isSelected = false,
    isPreview = false
  ) => {
    const pathId = isPreview ? "preview" : `path_${pathIndex}`;
    const svgData = pathToSVG(path);

    if (!svgData) return;

    let pathObject = pathObjects.get(pathId);

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
      pathObjects.set(pathId, pathObject);
    } else {
      pathObject.setAttrs({
        data: svgData,
        stroke: isSelected ? "#f59e0b" : "#3b82f6",
        fill: path.closed ? "rgba(59, 130, 246, 0.1)" : undefined,
        dash: isPreview ? [5, 5] : undefined,
      });
    }
  };

  const updatePreviewPath = (path, previewPoint) => {
    if (!path || !previewPoint || path.points.length === 0) {
      const previewPath = pathObjects.get("preview_line");
      if (previewPath) {
        previewPath.destroy();
        pathObjects.delete("preview_line");
      }
      return;
    }

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

  const updateControls = (path, pathIndex, selectedPoint, selectedHandle) => {
    if (!path) return;

    const controlPrefix = `controls_${pathIndex}`;
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

      if (point.handleIn) {
        const handleX = point.x + point.handleIn.x;
        const handleY = point.y + point.handleIn.y;
        const isSelectedHandle =
          selectedHandle?.pathIndex === pathIndex &&
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
          selectedHandle?.pathIndex === pathIndex &&
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

      const isSelectedPoint =
        selectedPoint?.pathIndex === pathIndex &&
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

  const clearAll = () => {
    for (let [key, obj] of pathObjects) {
      obj.destroy();
    }
    pathObjects.clear();

    for (let [key, obj] of controlObjects) {
      obj.destroy();
    }
    controlObjects.clear();

    for (let [key, obj] of previewObjects) {
      obj.destroy();
    }
    previewObjects.clear();
  };

  const render = (state) => {
    const {
      yjsDoc,
      currentPath,
      selectedPath,
      selectedPoint,
      selectedHandle,
      tool,
      previewPoint,
    } = state.context;

    clearAll();

    // Get paths from Yjs document
    const paths = getPathsFromYjs(yjsDoc);

    paths.forEach((path, pathIndex) => {
      updatePath(path, pathIndex, selectedPath === pathIndex);

      if (
        (tool === "select" || selectedPath === pathIndex) &&
        (selectedPath === pathIndex || tool === "select")
      ) {
        updateControls(path, pathIndex, selectedPoint, selectedHandle);
      }
    });

    if (currentPath) {
      if (previewPoint) {
        updatePreviewPath(currentPath, previewPoint);
      } else {
        updatePath(currentPath, -1, false, true);
      }
      updateControls(currentPath, -1, selectedPoint, selectedHandle);
    }

    layer.batchDraw();
  };

  receive((event) => {
    if (event.type === "RENDER") {
      currentState = event.state;
      render(currentState);
    }
  });

  return () => {
    clearAll();
  };
});

// Main state machine with Yjs integration
export const penToolMachine = setup({
  types: {
    input: {} as {
      layerRef: Konva.Layer;
      yjsDoc: Y.Doc;
    },
    context: {} as {
      layer: Konva.Layer;
      yjsDoc: Y.Doc;
      currentPath: Path | null;
      selectedPath: number | null;
      selectedPoint: any;
      selectedHandle: any;
      tool: "pen" | "select";
      dragStart: { x: number; y: number };
      previewPoint: { x: number; y: number } | null;
      mousePos: { x: number; y: number };
    },
    events: {} as
      | { type: "SET_TOOL"; tool: "pen" | "select" }
      | {
          type: "MOUSE_DOWN";
          point: { x: number; y: number };
          altKey: boolean;
          shiftKey: boolean;
        }
      | {
          type: "MOUSE_MOVE";
          point: { x: number; y: number };
          altKey: boolean;
          shiftKey: boolean;
        }
      | { type: "MOUSE_UP" }
      | { type: "KEY_PRESS"; key: string }
      | { type: "UNDO" }
      | { type: "REDO" }
      | { type: "CLEAR_ALL" }
      | { type: "YJS_UPDATE" },
  },
  actors: {
    canvasEventActor,
    rendererActor,
  },
  actions: {
    setTool: assign({
      tool: ({ event }) => event.tool,
    }),

    startNewPath: assign({
      currentPath: ({ event }) => ({
        id: `path_${Date.now()}`,
        points: [
          {
            x: event.point.x,
            y: event.point.y,
            handleIn: null,
            handleOut: null,
          },
        ],
        closed: false,
      }),
      selectedPoint: ({ event }) => ({ pathIndex: -1, pointIndex: 0 }),
      dragStart: ({ event }) => event.point,
    }),

    addPointToCurrentPath: assign({
      currentPath: ({ context, event }) => ({
        ...context.currentPath!,
        points: [
          ...context.currentPath!.points,
          {
            x: event.point.x,
            y: event.point.y,
            handleIn: null,
            handleOut: null,
          },
        ],
      }),
      selectedPoint: ({ context }) => ({
        pathIndex: -1,
        pointIndex: context.currentPath!.points.length,
      }),
      dragStart: ({ event }) => event.point,
    }),

    closeCurrentPath: assign(({ context }) => {
      if (context.currentPath) {
        const closedPath = { ...context.currentPath, closed: true };
        addPathToYjs(context.yjsDoc, closedPath);
        const paths = getPathsFromYjs(context.yjsDoc);
        return {
          currentPath: null,
          selectedPath: paths.length - 1,
          selectedPoint: null,
        };
      }
      return {};
    }),

    finishCurrentPath: assign(({ context }) => {
      if (context.currentPath) {
        addPathToYjs(context.yjsDoc, context.currentPath);
        const paths = getPathsFromYjs(context.yjsDoc);
        return {
          currentPath: null,
          selectedPath: paths.length - 1,
          selectedPoint: null,
          previewPoint: null,
        };
      }
      return {};
    }),

    createCurveHandles: assign({
      currentPath: ({ context, event }) => {
        if (!context.currentPath || !context.selectedPoint)
          return context.currentPath;

        const handleLength = distance(context.dragStart, event.point);
        const handleAngle = angle(context.dragStart, event.point);

        if (handleLength > 5) {
          const handles = createSymmetricHandle(
            context.dragStart,
            handleAngle,
            handleLength
          );
          const newPath = { ...context.currentPath };
          newPath.points[context.selectedPoint.pointIndex] = {
            ...newPath.points[context.selectedPoint.pointIndex],
            handleIn: handles.handleIn,
            handleOut: handles.handleOut,
          };
          return newPath;
        }
        return context.currentPath;
      },
    }),

    selectPoint: assign(({ context, event }) => {
      const paths = getPathsFromYjs(context.yjsDoc);

      for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
        const path = paths[pathIndex];
        for (let i = 0; i < path.points.length; i++) {
          if (distance(event.point, path.points[i]) < 10) {
            return {
              selectedPath: pathIndex,
              selectedPoint: { pathIndex, pointIndex: i },
              selectedHandle: null,
              dragStart: event.point,
            };
          }
        }
      }
      return {};
    }),

    selectHandle: assign(({ context, event }) => {
      const paths = getPathsFromYjs(context.yjsDoc);

      for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
        const path = paths[pathIndex];
        for (let i = 0; i < path.points.length; i++) {
          const p = path.points[i];

          if (p.handleOut) {
            const handlePos = {
              x: p.x + p.handleOut.x,
              y: p.y + p.handleOut.y,
            };
            if (distance(event.point, handlePos) < 8) {
              return {
                selectedPath: pathIndex,
                selectedHandle: { pathIndex, pointIndex: i, handle: "out" },
                dragStart: event.point,
              };
            }
          }

          if (p.handleIn) {
            const handlePos = { x: p.x + p.handleIn.x, y: p.y + p.handleIn.y };
            if (distance(event.point, handlePos) < 8) {
              return {
                selectedPath: pathIndex,
                selectedHandle: { pathIndex, pointIndex: i, handle: "in" },
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

      const dx = event.point.x - context.dragStart.x;
      const dy = event.point.y - context.dragStart.y;
      const paths = getPathsFromYjs(context.yjsDoc);
      const path = paths[context.selectedPoint.pathIndex];
      const pointToMove = path.points[context.selectedPoint.pointIndex];

      const updatedPoints = [...path.points];
      updatedPoints[context.selectedPoint.pointIndex] = {
        ...pointToMove,
        x: pointToMove.x + dx,
        y: pointToMove.y + dy,
      };

      updatePathInYjs(context.yjsDoc, context.selectedPoint.pathIndex, {
        points: updatedPoints,
      });

      return {
        dragStart: event.point,
      };
    }),

    moveHandle: assign(({ context, event }) => {
      if (!context.selectedHandle) return {};

      const paths = getPathsFromYjs(context.yjsDoc);
      const path = paths[context.selectedHandle.pathIndex];
      const point = path.points[context.selectedHandle.pointIndex];

      const handlePos = {
        x: event.point.x - point.x,
        y: event.point.y - point.y,
      };

      const updatedPoints = [...path.points];
      const updatedPoint = { ...point };

      if (context.selectedHandle.handle === "out") {
        updatedPoint.handleOut = handlePos;
        if (!event.altKey) {
          updatedPoint.handleIn = { x: -handlePos.x, y: -handlePos.y };
        }
      } else {
        updatedPoint.handleIn = handlePos;
        if (!event.altKey) {
          updatedPoint.handleOut = { x: -handlePos.x, y: -handlePos.y };
        }
      }

      updatedPoints[context.selectedHandle.pointIndex] = updatedPoint;
      updatePathInYjs(context.yjsDoc, context.selectedHandle.pathIndex, {
        points: updatedPoints,
      });

      return {};
    }),

    updatePreview: assign({
      previewPoint: ({ event }) => event.point,
    }),

    clearPreview: assign({
      previewPoint: () => null,
    }),

    clearSelection: assign({
      selectedPath: () => null,
      selectedPoint: () => null,
      selectedHandle: () => null,
    }),

    deleteSelectedPoint: assign(({ context }) => {
      if (context.selectedPath === null || !context.selectedPoint) return {};

      const paths = getPathsFromYjs(context.yjsDoc);
      const path = paths[context.selectedPath];

      if (path.points.length > 1) {
        const updatedPoints = [...path.points];
        updatedPoints.splice(context.selectedPoint.pointIndex, 1);
        updatePathInYjs(context.yjsDoc, context.selectedPath, {
          points: updatedPoints,
        });
        return {
          selectedPoint: null,
        };
      } else {
        removePathFromYjs(context.yjsDoc, context.selectedPath);
        return {
          selectedPath: null,
          selectedPoint: null,
        };
      }
    }),

    deleteSelectedPath: assign(({ context }) => {
      if (context.selectedPath !== null) {
        removePathFromYjs(context.yjsDoc, context.selectedPath);
      }
      return {
        selectedPath: null,
        selectedPoint: null,
        selectedHandle: null,
      };
    }),

    clearAll: assign(({ context }) => {
      clearAllPathsFromYjs(context.yjsDoc);
      return {
        currentPath: null,
        selectedPath: null,
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
      if (!context.currentPath || context.currentPath.points.length === 0)
        return false;
      const firstPoint = context.currentPath.points[0];
      return distance(event.point, firstPoint) < 10;
    },

    isExistingPointClick: ({ context, event }) => {
      if (!context.currentPath) return false;
      return context.currentPath.points.some(
        (p) => distance(event.point, p) < 10
      );
    },

    isHandleClick: ({ context, event }) => {
      const paths = getPathsFromYjs(context.yjsDoc);

      for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
        const path = paths[pathIndex];
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
      const paths = getPathsFromYjs(context.yjsDoc);

      for (let path of paths) {
        if (path.points.some((p) => distance(event.point, p) < 10)) return true;
      }
      return false;
    },

    hasSelectedPoint: ({ context }) => context.selectedPoint !== null,
    hasSelectedPath: ({ context }) => context.selectedPath !== null,
  },
}).createMachine({
  id: "penTool",
  initial: "initializing",
  context: ({ input }) => ({
    layer: input.layerRef,
    yjsDoc: input.yjsDoc,
    currentPath: null,
    selectedPath: null,
    selectedPoint: null,
    selectedHandle: null,
    tool: "pen",
    dragStart: { x: 0, y: 0 },
    previewPoint: null,
    mousePos: { x: 0, y: 0 },
  }),

  states: {
    initializing: {
      entry: ({ context }) => {
        // Set up Yjs observer to trigger re-renders when data changes
        context.yjsDoc.on("update", () => {
          // Trigger a render when Yjs data changes
          context.layer.getStage()?.fire("yjs:update");
        });
      },
      always: {
        target: "ready",
      },
    },

    ready: {
      invoke: [
        {
          id: "canvasEvents",
          systemId: "canvasEvents",
          src: "canvasEventActor",
          input: ({ context }) => ({ layer: context.layer }),
        },
        {
          id: "renderer",
          systemId: "renderer",
          src: "rendererActor",
          input: ({ context }) => ({ layer: context.layer }),
        },
      ],

      initial: "idle",
      entry: ["render"],

      states: {
        idle: {
          entry: ["render"],
          on: {
            SET_TOOL: {
              actions: ["setTool", "render"],
            },
            MOUSE_DOWN: [
              {
                guard: ({ context }) => context.tool === "pen",
                target: "penMode",
              },
              {
                guard: ({ context }) => context.tool === "select",
                target: "selectMode",
              },
            ],
            MOUSE_MOVE: {
              actions: ["updatePreview", "render"],
              guard: ({ context }) =>
                context.tool === "pen" && context.currentPath !== null,
            },
            KEY_PRESS: [
              {
                guard: ({ event, context }) =>
                  event.key === "Escape" && context.currentPath !== null,
                actions: ["finishCurrentPath", "render"],
              },
              {
                guard: ({ event, context }) =>
                  event.key === "Delete" &&
                  context.selectedPath !== null &&
                  context.selectedPoint !== null,
                actions: ["deleteSelectedPoint", "render"],
              },
              {
                guard: ({ event, context }) =>
                  event.key === "Delete" && context.selectedPath !== null,
                actions: ["deleteSelectedPath", "render"],
              },
            ],
            UNDO: {
              // Note: Yjs has built-in undo/redo with UndoManager
              // You would need to set up Y.UndoManager for this to work
              actions: ["render"],
            },
            REDO: {
              // Note: Yjs has built-in undo/redo with UndoManager
              actions: ["render"],
            },
            CLEAR_ALL: {
              actions: ["clearAll", "render"],
            },
            YJS_UPDATE: {
              actions: ["render"],
            },
          },
        },

        penMode: {
          initial: "checkingClick",
          states: {
            checkingClick: {
              always: [
                {
                  guard: "isFirstPointClick",
                  target: "#penTool.ready.idle",
                  actions: ["closeCurrentPath", "render"],
                },
                {
                  guard: "isExistingPointClick",
                  target: "creatingCurve",
                  actions: ["selectPoint"],
                },
                {
                  guard: ({ context }) => context.currentPath !== null,
                  target: "creatingCurve",
                  actions: ["addPointToCurrentPath"],
                },
                {
                  target: "creatingCurve",
                  actions: ["startNewPath"],
                },
              ],
            },

            creatingCurve: {
              entry: log("penmode"),
              on: {
                MOUSE_MOVE: {
                  actions: ["createCurveHandles", "render"],
                },
                MOUSE_UP: {
                  target: "#penTool.ready.idle",
                  actions: ["clearSelection", "render"],
                },
              },
            },
          },
        },

        selectMode: {
          initial: "checkingClick",
          states: {
            checkingClick: {
              always: [
                {
                  guard: "isHandleClick",
                  target: "draggingHandle",
                },
                {
                  guard: "isPointClick",
                  target: "draggingPoint",
                },
                {
                  target: "#penTool.ready.idle",
                  actions: ["clearSelection"],
                },
              ],
            },

            draggingHandle: {
              entry: ["selectHandle"],
              on: {
                MOUSE_MOVE: {
                  actions: ["moveHandle", "render"],
                },
                MOUSE_UP: {
                  target: "#penTool.ready.idle",
                },
              },
            },

            draggingPoint: {
              entry: ["selectPoint"],
              on: {
                MOUSE_MOVE: {
                  actions: ["movePoint", "render"],
                },
                MOUSE_UP: {
                  target: "#penTool.ready.idle",
                },
              },
            },
          },
        },
      },
    },
  },
});
