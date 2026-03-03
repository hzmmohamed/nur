import { setup, assign } from "xstate";
import type { PenTool } from "./impls";
import type { Point } from "./impls";

// ============================================================================
// SIMPLIFIED STATE MACHINE
// ============================================================================

/**
 * This state machine is much simpler because the heavy lifting is done
 * by the individual classes (PathDrawer, PathEditor, etc.)
 *
 * The state machine only coordinates high-level mode transitions:
 * - idle: No active operation
 * - drawing: Creating a new path
 * - editing: Modifying an existing path
 */

export interface PenToolMachineContext {
  penTool: PenTool;
  cursorPosition: Point;
  modifierKeys: {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
  };
}

export type PenToolMachineEvent =
  | { type: "START_DRAWING"; point: Point }
  | { type: "ADD_POINT"; point: Point }
  | { type: "CLOSE_PATH" }
  | { type: "CANCEL_DRAWING" }
  | { type: "SELECT_PATH"; pathId: string }
  | { type: "DESELECT" }
  | { type: "EDIT_POINT"; pointIndex: number }
  | { type: "EDIT_HANDLE"; pointIndex: number; handleType: "in" | "out" }
  | { type: "DELETE_POINTS" }
  | { type: "TOGGLE_POINT_TYPE"; pointIndex: number }
  | { type: "CURSOR_MOVE"; point: Point }
  | { type: "KEY_DOWN"; key: string }
  | { type: "KEY_UP"; key: string };

export const penToolStateMachine = setup({
  types: {
    input: {} as Pick<PenToolMachineContext, "penTool">,
    context: {} as PenToolMachineContext,
    events: {} as PenToolMachineEvent,
  },

  actions: {
    updateCursor: assign({
      cursorPosition: ({ event }) => {
        if (event.type === "CURSOR_MOVE") {
          return event.point;
        }
        return { x: 0, y: 0 };
      },
    }),

    updateModifiers: assign({
      modifierKeys: ({ context, event }) => {
        if (event.type === "KEY_DOWN" || event.type === "KEY_UP") {
          const isDown = event.type === "KEY_DOWN";
          const key = event.key.toLowerCase();

          return {
            shift: key === "shift" ? isDown : context.modifierKeys.shift,
            alt: key === "alt" ? isDown : context.modifierKeys.alt,
            ctrl:
              key === "control" || key === "meta"
                ? isDown
                : context.modifierKeys.ctrl,
          };
        }
        return context.modifierKeys;
      },
    }),
  },
}).createMachine({
  id: "penToolSimple",
  initial: "idle",
  context: ({ input }: { input: { penTool: PenTool } }) => ({
    penTool: input.penTool,
    cursorPosition: { x: 0, y: 0 },
    modifierKeys: {
      shift: false,
      alt: false,
      ctrl: false,
    },
  }),

  on: {
    CURSOR_MOVE: {
      actions: ["updateCursor"],
    },
    KEY_DOWN: {
      actions: ["updateModifiers"],
    },
    KEY_UP: {
      actions: ["updateModifiers"],
    },
  },

  states: {
    idle: {
      on: {
        START_DRAWING: {
          target: "drawing",
        },
        SELECT_PATH: {
          target: "editing",
        },
      },
    },

    drawing: {
      on: {
        ADD_POINT: {
          target: "drawing",
        },
        CLOSE_PATH: {
          target: "idle",
        },
        CANCEL_DRAWING: {
          target: "idle",
        },
      },
    },

    editing: {
      on: {
        EDIT_POINT: {
          target: "editing",
        },
        EDIT_HANDLE: {
          target: "editing",
        },
        DELETE_POINTS: {
          target: "editing",
        },
        TOGGLE_POINT_TYPE: {
          target: "editing",
        },
        DESELECT: {
          target: "idle",
        },
        START_DRAWING: {
          target: "drawing",
        },
      },
    },
  },
});
