import { createMachine, setup, type CallbackActorLogic } from "xstate";
import type { BezierPoint } from "../data-model/types";

type Commands = {
  type: "ADD_POINT";
};

// On receiving the action "ADD_POINT", it executes the action "addPoint".

setup({
  types: {
    context: {} as {
      points: Array<BezierPoint>;
    },
    // children: {} as {
    //   mousePointActor: CallbackActorLogic<{ type: "" }>;
    // },
    events: {} as
      | { type: "MOUSE_DOWN"; point: { x: number; y: number }; altKey: boolean }
      | { type: "MOUSE_MOVE"; point: { x: number; y: number }; altKey: boolean }
      | { type: "MOUSE_UP" },
  },
  actors
}).createMachine({
  context: {
    points: [],
  },
  invoke: [],
})



StartNewPath

Renderer will render the data
And will attach event handlers

if mousedown+isAltKey then delete

if you're in deletion mode, set a new event handler on these nodes. Then