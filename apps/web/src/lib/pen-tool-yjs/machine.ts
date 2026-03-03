import type Konva from "konva";
import type { KonvaEventListener } from "konva/lib/Node";
import type { Stage } from "konva/lib/Stage";
import { fromCallback, createMachine } from "xstate";
import type { IVideoEditingProject } from "../data-model/interface";

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

// Main state machine
export const penToolMachine = createMachine({
  id: "penTool",
  types: {
    input: {} as {
      layerRef: Konva.Layer;
      projectManager: IVideoEditingProject;
      layerId: string;
      frameId: string;
      userId: string;
    },
    context: {} as {
      layer: Konva.Layer;
      projectManager: IVideoEditingProject;
      layerId: string;
      frameId: string;
      userId: string;
      currentPathId: string | null;
      selectedPathId: string | null;
      selectedPoint: {
        pathId: string;
        pointIndex: number;
      } | null;
      selectedHandle: {
        pathId: string;
        pointIndex: number;
        handle: "in" | "out";
      } | null;
      tool: "pen" | "select";
      dragStart: { x: number; y: number };
      previewPoint: { x: number; y: number } | null;
      mousePos: { x: number; y: number };
    },
    events: {} as
      | { type: "SET_TOOL"; tool: "pen" | "select" }
      | { type: "MOUSE_DOWN"; point: { x: number; y: number }; altKey: boolean }
      | { type: "MOUSE_MOVE"; point: { x: number; y: number }; altKey: boolean }
      | { type: "MOUSE_UP" }
      | { type: "KEY_PRESS"; key: string }
      | { type: "CLEAR_ALL" }
      | { type: "RESIZE_CANVAS"; size: { width: number; height: number } },
  },
  initial: "initializing",
  context: ({ input }) => ({
    layer: input.layerRef,
    projectManager: input.projectManager,
    layerId: input.layerId,
    frameId: input.frameId,
    userId: input.userId,
    currentPathId: null,
    selectedPathId: null,
    selectedPoint: null,
    selectedHandle: null,
    tool: "pen" as const,
    dragStart: { x: 0, y: 0 },
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
                context.tool === "pen" && context.currentPathId !== null,
            },
            KEY_PRESS: [
              {
                guard: ({ event, context }) =>
                  event.key === "Escape" && context.currentPathId !== null,
                actions: ["finishCurrentPath", "render"],
              },
              {
                guard: ({ event, context }) =>
                  event.key === "Delete" &&
                  context.selectedPathId !== null &&
                  context.selectedPoint !== null,
                actions: ["deleteSelectedPoint", "render"],
              },
              {
                guard: ({ event, context }) =>
                  event.key === "Delete" && context.selectedPathId !== null,
                actions: ["deleteSelectedPath", "render"],
              },
            ],
            CLEAR_ALL: {
              actions: ["clearAll", "render"],
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
                  guard: ({ context }) => context.currentPathId !== null,
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
                },
              },
            },
          },
        },
      },
    },
  },
}).provide({
  actors: {
    canvasEventActor,
  },
});
