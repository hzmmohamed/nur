import type Konva from "konva";
import { createMachine } from "xstate";
import { canvasEventActor, type CanvasEvent } from "./utils";
import { mouseCursorActor, mousePointActor } from "./mouse-cursor-actors";
import {
  createSinglePathManager,
  type IMaskManager,
  type ISinglePathManager,
} from "../data-model/interface";
import type { BezierPath, BezierPoint } from "../data-model/types";

const singlePathEditorActor = createMachine({
  id: "penTool",
  types: {
    input: {} as {
      layer: Konva.Layer;
      pathManager: ISinglePathManager;
      startPoint: BezierPoint;
    },
    actions: {} as
      | { type: "selectHandle" }
      | { type: "selectPoint" }
      | { type: "clearSelection" }
      | { type: "deleteSelectedPoint" }
      | { type: "deleteSelectedPath" },
    // | { type: "clearAll" },
  },
  invoke: {
    src: canvasEventActor,
    input: ({ context }) => ({
      layer: context.layer,
      enableMouseDown: true,
    }),
  },
  initial: "idle",
  states: {
    idle: {
      on: {
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
              target: "#penTool.idle",
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
              target: "#penTool.idle",
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
              target: "#penTool.idle",
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
              target: "#penTool.idle",
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
              target: "#penTool.idle",
            },
          },
        },
      },
    },
  },
});

// Main state machine
export const penToolMachine = createMachine({
  id: "penTool",
  types: {
    input: {} as {
      layerRef: Konva.Layer;
      project: IMaskManager;
    },
    context: {} as {
      layer: Konva.Layer;
      project: IMaskManager;
      currentPathId: BezierPath | null;
    },
    events: {} as CanvasEvent | { type: "CLEAR_ALL" },
    actions: {} as { type: "startNewPathAndSaveId" },
  },
  initial: "idle",
  context: ({ input }) => ({
    layer: input.layerRef,
    project: input.project,
    currentPathId: null,
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
  states: {
    idle: {
      invoke: {
        src: canvasEventActor,
        input: ({ context }) => ({
          layer: context.layer,
          enableMouseDown: true,
        }),
      },
      on: {
        MOUSE_DOWN: {
          target: "drawing",
          actions: "startNewPathAndSaveId",
        },
      },
    },
    drawing: {
      invoke: {
        src: singlePathEditorActor,
        input: ({ event, context }) => ({
          layer: context.layer,
          pathManager: createSinglePathManager(
            context.project,
            context.currentPathId,
            "1",
            "2"
          ),
          startPoint: event.type == "MOUSE_DOWN" ? event.point : { x: 0, y: 0 },
        }),
      },
    },
  },
}).provide({
  actors: {
    canvasEventActor,
  },
});

// drawing: {
// on: {
//   MOUSE_DOWN: {
//     target: "drawing",
//   },
//   MOUSE_MOVE: {
//     actions: ["updatePreview"],
//     guard: ({ context }) => context.currentPath !== null,
//   },
//   KEY_PRESS: [
//     {
//       guard: ({ event, context }) =>
//         event.key === "Escape" && context.currentPath !== null,
//       actions: ["finishCurrentPath"],
//     },
//     {
//       guard: ({ event, context }) =>
//         event.key === "Delete" && context.selectedPoint !== null,
//       actions: ["deleteSelectedPoint"],
//     },
//     {
//       guard: ({ event, context }) =>
//         event.key === "Delete" && context.currentPath !== null,
//       actions: ["deleteSelectedPath"],
//     },
//   ],
//   CLEAR_ALL: {
//     actions: ["clearAll"],
//   },
// },
// },

// drawing: {
//   initial: "checkingClick",
//   states: {
//     checkingClick: {
//       always: [
//         {
//           guard: "isFirstPointClick",
//           target: "#penTool.idle",
//           actions: ["closeCurrentPath"],
//         },
//         {
//           guard: "isExistingPointClick",
//           target: "creatingCurve",
//           actions: ["selectPoint"],
//         },
//         {
//           guard: ({ context }) => context.currentPath !== null,
//           target: "creatingCurve",
//           actions: ["addPointToCurrentPath"],
//         },
//         {
//           target: "creatingCurve",
//           actions: ["startNewPath"],
//         },
//       ],
//     },

//     creatingCurve: {
//       on: {
//         MOUSE_MOVE: {
//           actions: ["createCurveHandles"],
//         },
//         MOUSE_UP: {
//           target: "#penTool.idle",
//           actions: ["clearSelection"],
//         },
//       },
//     },
//   },
// },

//paths: BezierPath[];
// selectedPoint: {
//   pointIndex: number;
// } | null;
// selectedHandle: {
//   pointIndex: number;
//   handle: "in" | "out";
// } | null;
// dragStart: { x: number; y: number };
// previewPoint: { x: number; y: number } | null;
// mousePos: { x: number; y: number };
