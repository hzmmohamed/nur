import type Konva from "konva";
import type { KonvaEventListener } from "konva/lib/Node";
import type { Stage } from "konva/lib/Stage";
import { assign, setup, fromCallback, log } from "xstate";
import { rendererActor } from "./renderer";
// Types
interface Point {
  x: number;
  y: number;
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

// Canvas event handler actor
const canvasEventActor = fromCallback<{ type: "" }, { layer: Konva.Layer }>(
  ({ sendBack, input }) => {
    const { layer } = input;
    const stage = layer.getStage();

    const handleMouseDown: KonvaEventListener<Stage, MouseEvent> = (e) => {
      const point = e.currentTarget.getRelativePointerPosition();
      sendBack({
        type: "MOUSE_DOWN",
        point,
        altKey: e.evt.altKey,
        shiftKey: e.evt.shiftKey,
      });
    };

    const handleMouseMove: KonvaEventListener<Stage, MouseEvent> = (e) => {
      const point = e.currentTarget.getRelativePointerPosition();
      console.log(point);
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
    // window.addEventListener("resize", handleResize);

    // Initialize canvas size
    // handleResize();

    // Cleanup function
    return () => {
      stage.off("mousemove", handleMouseMove);
      stage.off("mouseup", handleMouseUp);
      stage.off("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
      //   window.removeEventListener("resize", handleResize);
    };
  }
);

// // Renderer actor
// const rendererActor = fromCallback(({ receive, input }) => {
//   const { canvas } = input;
//   let currentState = null;

//   // const drawGrid = (ctx, canvasSize) => {
//   //   const gridSize = 20;
//   //   ctx.strokeStyle = "#e5e5e5";
//   //   ctx.lineWidth = 1;

//   //   ctx.beginPath();
//   //   for (let x = 0; x <= canvasSize.width; x += gridSize) {
//   //     ctx.moveTo(x, 0);
//   //     ctx.lineTo(x, canvasSize.height);
//   //   }
//   //   for (let y = 0; y <= canvasSize.height; y += gridSize) {
//   //     ctx.moveTo(0, y);
//   //     ctx.lineTo(canvasSize.width, y);
//   //   }
//   //   ctx.stroke();
//   // };

//   const drawPath = (ctx, path, isSelected = false, isPreview = false) => {
//     if (path.points.length === 0) return;

//     ctx.beginPath();
//     ctx.moveTo(path.points[0].x, path.points[0].y);

//     for (let i = 1; i < path.points.length; i++) {
//       const currentPoint = path.points[i];
//       const previousPoint = path.points[i - 1];

//       if (previousPoint.handleOut || currentPoint.handleIn) {
//         const cp1x =
//           previousPoint.x +
//           (previousPoint.handleOut ? previousPoint.handleOut.x : 0);
//         const cp1y =
//           previousPoint.y +
//           (previousPoint.handleOut ? previousPoint.handleOut.y : 0);
//         const cp2x =
//           currentPoint.x +
//           (currentPoint.handleIn ? currentPoint.handleIn.x : 0);
//         const cp2y =
//           currentPoint.y +
//           (currentPoint.handleIn ? currentPoint.handleIn.y : 0);

//         ctx.bezierCurveTo(
//           cp1x,
//           cp1y,
//           cp2x,
//           cp2y,
//           currentPoint.x,
//           currentPoint.y
//         );
//       } else {
//         ctx.lineTo(currentPoint.x, currentPoint.y);
//       }
//     }

//     if (path.closed) {
//       const firstPoint = path.points[0];
//       const lastPoint = path.points[path.points.length - 1];

//       if (lastPoint.handleOut || firstPoint.handleIn) {
//         const cp1x =
//           lastPoint.x + (lastPoint.handleOut ? lastPoint.handleOut.x : 0);
//         const cp1y =
//           lastPoint.y + (lastPoint.handleOut ? lastPoint.handleOut.y : 0);
//         const cp2x =
//           firstPoint.x + (firstPoint.handleIn ? firstPoint.handleIn.x : 0);
//         const cp2y =
//           firstPoint.y + (firstPoint.handleIn ? firstPoint.handleIn.y : 0);

//         ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, firstPoint.x, firstPoint.y);
//       } else {
//         ctx.lineTo(firstPoint.x, firstPoint.y);
//       }
//       ctx.closePath();
//     }

//     if (path.closed) {
//       ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
//       ctx.fill();
//     }

//     ctx.strokeStyle = isSelected ? "#f59e0b" : "#3b82f6";
//     ctx.lineWidth = 2;
//     ctx.lineCap = "round";
//     ctx.lineJoin = "round";

//     if (isPreview) {
//       ctx.setLineDash([5, 5]);
//     } else {
//       ctx.setLineDash([]);
//     }

//     ctx.stroke();
//   };

//   const drawPreviewPath = (ctx, path, previewPoint) => {
//     if (!path || !previewPoint || path.points.length === 0) return;

//     ctx.beginPath();
//     ctx.moveTo(path.points[0].x, path.points[0].y);

//     for (let i = 1; i < path.points.length; i++) {
//       const currentPoint = path.points[i];
//       const previousPoint = path.points[i - 1];

//       if (previousPoint.handleOut || currentPoint.handleIn) {
//         const cp1x =
//           previousPoint.x +
//           (previousPoint.handleOut ? previousPoint.handleOut.x : 0);
//         const cp1y =
//           previousPoint.y +
//           (previousPoint.handleOut ? previousPoint.handleOut.y : 0);
//         const cp2x =
//           currentPoint.x +
//           (currentPoint.handleIn ? currentPoint.handleIn.x : 0);
//         const cp2y =
//           currentPoint.y +
//           (currentPoint.handleIn ? currentPoint.handleIn.y : 0);

//         ctx.bezierCurveTo(
//           cp1x,
//           cp1y,
//           cp2x,
//           cp2y,
//           currentPoint.x,
//           currentPoint.y
//         );
//       } else {
//         ctx.lineTo(currentPoint.x, currentPoint.y);
//       }
//     }

//     const lastPoint = path.points[path.points.length - 1];
//     if (lastPoint.handleOut) {
//       const cp1x = lastPoint.x + lastPoint.handleOut.x;
//       const cp1y = lastPoint.y + lastPoint.handleOut.y;
//       ctx.bezierCurveTo(
//         cp1x,
//         cp1y,
//         previewPoint.x,
//         previewPoint.y,
//         previewPoint.x,
//         previewPoint.y
//       );
//     } else {
//       ctx.lineTo(previewPoint.x, previewPoint.y);
//     }

//     ctx.strokeStyle = "#3b82f6";
//     ctx.lineWidth = 2;
//     ctx.setLineDash([5, 5]);
//     ctx.stroke();
//   };

//   const drawControls = (
//     ctx,
//     path,
//     pathIndex,
//     selectedPoint,
//     selectedHandle
//   ) => {
//     if (!path) return;

//     path.points.forEach((point, pointIndex) => {
//       // Draw handle lines
//       if (point.handleIn) {
//         ctx.beginPath();
//         ctx.moveTo(point.x, point.y);
//         ctx.lineTo(point.x + point.handleIn.x, point.y + point.handleIn.y);
//         ctx.strokeStyle = "#666";
//         ctx.lineWidth = 1;
//         ctx.setLineDash([]);
//         ctx.stroke();
//       }

//       if (point.handleOut) {
//         ctx.beginPath();
//         ctx.moveTo(point.x, point.y);
//         ctx.lineTo(point.x + point.handleOut.x, point.y + point.handleOut.y);
//         ctx.strokeStyle = "#666";
//         ctx.lineWidth = 1;
//         ctx.setLineDash([]);
//         ctx.stroke();
//       }

//       // Draw handle points
//       if (point.handleIn) {
//         const handleX = point.x + point.handleIn.x;
//         const handleY = point.y + point.handleIn.y;
//         const isSelectedHandle =
//           selectedHandle?.pathIndex === pathIndex &&
//           selectedHandle?.pointIndex === pointIndex &&
//           selectedHandle?.handle === "in";

//         ctx.beginPath();
//         ctx.arc(handleX, handleY, 3, 0, 2 * Math.PI);
//         ctx.fillStyle = isSelectedHandle ? "#f59e0b" : "#666";
//         ctx.fill();
//         ctx.strokeStyle = "white";
//         ctx.lineWidth = 1;
//         ctx.stroke();
//       }

//       if (point.handleOut) {
//         const handleX = point.x + point.handleOut.x;
//         const handleY = point.y + point.handleOut.y;
//         const isSelectedHandle =
//           selectedHandle?.pathIndex === pathIndex &&
//           selectedHandle?.pointIndex === pointIndex &&
//           selectedHandle?.handle === "out";

//         ctx.beginPath();
//         ctx.arc(handleX, handleY, 3, 0, 2 * Math.PI);
//         ctx.fillStyle = isSelectedHandle ? "#f59e0b" : "#666";
//         ctx.fill();
//         ctx.strokeStyle = "white";
//         ctx.lineWidth = 1;
//         ctx.stroke();
//       }

//       // Draw main control point
//       const isSelectedPoint =
//         selectedPoint?.pathIndex === pathIndex &&
//         selectedPoint?.pointIndex === pointIndex;

//       ctx.beginPath();
//       ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
//       ctx.fillStyle = isSelectedPoint ? "#f59e0b" : "#3b82f6";
//       ctx.fill();
//       ctx.strokeStyle = "white";
//       ctx.lineWidth = 2;
//       ctx.stroke();

//       // First point indicator for open paths
//       if (pointIndex === 0 && !path.closed) {
//         ctx.beginPath();
//         ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
//         ctx.strokeStyle = "#10b981";
//         ctx.lineWidth = 2;
//         ctx.setLineDash([2, 2]);
//         ctx.stroke();
//         ctx.setLineDash([]);
//       }
//     });
//   };

//   const render = (state) => {
//     const {
//       layer,
//       paths,
//       currentPath,
//       selectedPath,
//       selectedPoint,
//       selectedHandle,
//       tool,
//       previewPoint,
//     } = state.context;

//     const canvas = layer.getCanvas();
//     const ctx = canvas.context;
//     ctx.clearRect(0, 0, canvas.width, canvas.height);

//     // drawGrid(ctx, canvasSize);

//     paths.forEach((path, pathIndex) => {
//       drawPath(ctx, path, selectedPath === pathIndex);

//       if (
//         (tool === "select" || selectedPath === pathIndex) &&
//         (selectedPath === pathIndex || tool === "select")
//       ) {
//         drawControls(ctx, path, pathIndex, selectedPoint, selectedHandle);
//       }
//     });

//     if (currentPath) {
//       if (previewPoint) {
//         drawPreviewPath(ctx, currentPath, previewPoint);
//       } else {
//         drawPath(ctx, currentPath, false, true);
//       }
//       drawControls(ctx, currentPath, -1, selectedPoint, selectedHandle);
//     }
//   };

//   receive((event) => {
//     if (event.type === "RENDER") {
//       currentState = event.state;
//       render(currentState);
//     }
//   });

//   return () => {
//     // Cleanup if needed
//   };
// });

// Main state machine
export const penToolMachine = setup({
  types: {
    input: {} as {
      layerRef: Konva.Layer;
    },
    context: {} as {
      layer: Konva.Layer;
      paths: Array<any>;
      currentPath: any;
      selectedPath: number | null;
      selectedPoint: any;
      selectedHandle: any;
      tool: "pen" | "select";
      dragStart: { x: number; y: number };
      history: Array<any>;
      historyIndex: number;
      previewPoint: { x: number; y: number } | null;
      mousePos: { x: number; y: number };
    },
    events: {} as
      | { type: "SET_TOOL"; tool: "pen" | "select" }
      | { type: "SET_CANVAS"; canvas: HTMLCanvasElement }
      | { type: "MOUSE_DOWN"; point: { x: number; y: number }; altKey: boolean }
      | { type: "MOUSE_MOVE"; point: { x: number; y: number }; altKey: boolean }
      | { type: "MOUSE_UP" }
      | { type: "KEY_PRESS"; key: string }
      | { type: "UNDO" }
      | { type: "REDO" }
      | { type: "CLEAR_ALL" }
      | { type: "RESIZE_CANVAS"; size: { width: number; height: number } },
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
        id: Date.now(),
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
        ...context.currentPath,
        points: [
          ...context.currentPath.points,
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
        pointIndex: context.currentPath.points.length,
      }),
      dragStart: ({ event }) => event.point,
    }),

    closeCurrentPath: assign({
      paths: ({ context }) => [
        ...context.paths,
        { ...context.currentPath, closed: true },
      ],
      currentPath: () => null,
      selectedPath: ({ context }) => context.paths.length,
      selectedPoint: () => null,
    }),

    finishCurrentPath: assign({
      paths: ({ context }) => [...context.paths, context.currentPath],
      currentPath: () => null,
      selectedPath: ({ context }) => context.paths.length,
      selectedPoint: () => null,
      previewPoint: () => null,
    }),

    createCurveHandles: assign({
      currentPath: ({ context, event }) => {
        if (!context.currentPath || !context.selectedPoint)
          return context.currentPath;

        console.log(context.dragStart);

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
      // Find closest point
      for (let path of context.paths) {
        for (let i = 0; i < path.points.length; i++) {
          if (distance(event.point, path.points[i]) < 10) {
            return {
              selectedPath: context.paths.indexOf(path),
              selectedPoint: {
                pathIndex: context.paths.indexOf(path),
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
      // Find closest handle
      for (let pathIndex = 0; pathIndex < context.paths.length; pathIndex++) {
        const path = context.paths[pathIndex];
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

    movePoint: assign({
      paths: ({ context, event }) => {
        if (!context.selectedPoint) return context.paths;

        const dx = event.point.x - context.dragStart.x;
        const dy = event.point.y - context.dragStart.y;
        const newPaths = [...context.paths];
        const path = newPaths[context.selectedPoint.pathIndex];
        const pointToMove = path.points[context.selectedPoint.pointIndex];

        pointToMove.x += dx;
        pointToMove.y += dy;

        return newPaths;
      },
      dragStart: ({ event }) => event.point,
    }),

    moveHandle: assign({
      paths: ({ context, event }) => {
        if (!context.selectedHandle) return context.paths;

        const dx = event.point.x - context.dragStart.x;
        const dy = event.point.y - context.dragStart.y;
        const newPaths = [...context.paths];
        const path = newPaths[context.selectedHandle.pathIndex];
        const point = path.points[context.selectedHandle.pointIndex];

        const handlePos = { x: dx, y: dy };

        if (context.selectedHandle.handle === "out") {
          point.handleOut = handlePos;
          if (!event.altKey) {
            point.handleIn = { x: -handlePos.x, y: -handlePos.y };
          }
        } else {
          point.handleIn = handlePos;
          if (!event.altKey) {
            point.handleOut = { x: -handlePos.x, y: -handlePos.y };
          }
        }

        return newPaths;
      },
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

    deleteSelectedPoint: assign({
      paths: ({ context }) => {
        if (context.selectedPath === null || !context.selectedPoint)
          return context.paths;

        const newPaths = [...context.paths];
        const path = newPaths[context.selectedPath];

        if (path.points.length > 1) {
          path.points.splice(context.selectedPoint.pointIndex, 1);
          return newPaths;
        } else {
          return newPaths.filter((_, index) => index !== context.selectedPath);
        }
      },
      selectedPoint: ({ context }) => {
        if (context.selectedPath === null || !context.selectedPoint)
          return null;
        const path = context.paths[context.selectedPath];
        return path?.points.length > 1 ? null : null;
      },
      selectedPath: ({ context }) => {
        if (context.selectedPath === null || !context.selectedPoint)
          return context.selectedPath;
        const path = context.paths[context.selectedPath];
        return path?.points.length > 1 ? context.selectedPath : null;
      },
    }),

    deleteSelectedPath: assign({
      paths: ({ context }) =>
        context.paths.filter((_, index) => index !== context.selectedPath),
      selectedPath: () => null,
      selectedPoint: () => null,
      selectedHandle: () => null,
    }),

    saveToHistory: assign({
      history: ({ context }) => {
        const newHistory = context.history.slice(0, context.historyIndex + 1);
        newHistory.push(JSON.parse(JSON.stringify(context.paths)));
        return newHistory;
      },
      historyIndex: ({ context }) => {
        const newHistory = context.history.slice(0, context.historyIndex + 1);
        return newHistory.length;
      },
    }),

    undo: assign({
      paths: ({ context }) =>
        context.historyIndex > 0
          ? context.history[context.historyIndex - 1]
          : context.paths,
      historyIndex: ({ context }) => Math.max(0, context.historyIndex - 1),
      currentPath: () => null,
      selectedPath: () => null,
      selectedPoint: () => null,
      selectedHandle: () => null,
    }),

    redo: assign({
      paths: ({ context }) =>
        context.historyIndex < context.history.length - 1
          ? context.history[context.historyIndex + 1]
          : context.paths,
      historyIndex: ({ context }) =>
        Math.min(context.history.length - 1, context.historyIndex + 1),
      currentPath: () => null,
      selectedPath: () => null,
      selectedPoint: () => null,
      selectedHandle: () => null,
    }),

    clearAll: assign({
      paths: () => [],
      currentPath: () => null,
      selectedPath: () => null,
      selectedPoint: () => null,
      selectedHandle: () => null,
      previewPoint: () => null,
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
      for (let pathIndex = 0; pathIndex < context.paths.length; pathIndex++) {
        const path = context.paths[pathIndex];
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
      for (let path of context.paths) {
        if (path.points.some((p) => distance(event.point, p) < 10)) return true;
      }
      return false;
    },

    canUndo: ({ context }) => context.historyIndex > 0,
    canRedo: ({ context }) => context.historyIndex < context.history.length - 1,

    hasSelectedPoint: ({ context }) => context.selectedPoint !== null,
    hasSelectedPath: ({ context }) => context.selectedPath !== null,
  },
}).createMachine({
  id: "penTool",
  initial: "initializing",
  context: ({ input }) => ({
    layer: input.layerRef,
    paths: [],
    currentPath: null,
    selectedPath: null,
    selectedPoint: null,
    selectedHandle: null,
    tool: "pen",
    dragStart: { x: 0, y: 0 },
    history: [],
    historyIndex: -1,
    previewPoint: null,
    mousePos: { x: 0, y: 0 },
  }),
  states: {
    initializing: {
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
                actions: ["finishCurrentPath", "saveToHistory", "render"],
              },
              {
                guard: ({ event, context }) =>
                  event.key === "Delete" &&
                  context.selectedPath !== null &&
                  context.selectedPoint !== null,
                actions: ["deleteSelectedPoint", "saveToHistory", "render"],
              },
              {
                guard: ({ event, context }) =>
                  event.key === "Delete" && context.selectedPath !== null,
                actions: ["deleteSelectedPath", "saveToHistory", "render"],
              },
            ],
            UNDO: {
              guard: "canUndo",
              actions: ["undo", "render"],
            },
            REDO: {
              guard: "canRedo",
              actions: ["redo", "render"],
            },
            CLEAR_ALL: {
              actions: ["clearAll", "saveToHistory", "render"],
            },
            RESIZE_CANVAS: {
              actions: ["resizeCanvas", "render"],
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
                  actions: ["closeCurrentPath", "saveToHistory", "render"],
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
                  actions: ["moveHandle"],
                },
                MOUSE_UP: {
                  target: "#penTool.ready.idle",
                  actions: ["saveToHistory"],
                },
              },
            },

            draggingPoint: {
              entry: ["selectPoint"],
              on: {
                MOUSE_MOVE: {
                  actions: ["movePoint"],
                },
                MOUSE_UP: {
                  target: "#penTool.ready.idle",
                  actions: ["saveToHistory"],
                },
              },
            },
          },
        },
      },
    },
  },
});
