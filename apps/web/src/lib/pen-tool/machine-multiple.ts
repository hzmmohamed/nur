import type Konva from "konva";
import { assign, createMachine } from "xstate";
import { rendererActor } from "./renderer";
import {
  canvasEventActor,
  distance,
  angle,
  createSymmetricHandle,
} from "./utils";
import { mouseCursorActor, mousePointActor } from "./mouse-cursor-actors";

// Main state machine
export const penToolMachine = createMachine({
  id: "penTool",
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
      | { type: "MOUSE_DOWN"; point: { x: number; y: number }; altKey: boolean }
      | { type: "MOUSE_MOVE"; point: { x: number; y: number }; altKey: boolean }
      | { type: "MOUSE_UP" }
      | { type: "KEY_PRESS"; key: string }
      | { type: "UNDO" }
      | { type: "REDO" }
      | { type: "CLEAR_ALL" }
      | { type: "RESIZE_CANVAS"; size: { width: number; height: number } },
  },
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
  invoke: [
    {
      src: mousePointActor,
      input: ({ context }) => ({
        layer: context.layer,
      }),
    },
    {
      src: mouseCursorActor,
      input: ({ context }) => ({
        layer: context.layer,
      }),
    },
  ],
  initial: "initializing",
  states: {
    initializing: {
      always: {
        target: "ready",
      },
    },
    ready: {
      invoke: [
        {
          src: canvasEventActor,
          input: ({ context }) => ({
            layer: context.layer,
            enableMouseDown: true,
            enableMouseMove: true,
            enableMouseUp: true,
            enableKeyboard: true,
          }),
        },
        {
          id: "renderer",
          systemId: "renderer",
          src: rendererActor,
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
              actions: ({ context }) => console.log(context.history),
              // guard: "canUndo",
              // actions: ["undo", "render"],
            },
            REDO: {
              guard: "canRedo",
              actions: ["redo", "render"],
            },
            CLEAR_ALL: {
              actions: ["clearAll", "saveToHistory", "render"],
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
}).provide({
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
});
