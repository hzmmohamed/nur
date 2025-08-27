import {
  assign,
  createMachine,
  fromCallback,
  type ActorRefFromLogic,
} from "xstate";
import { frameFetcherMachine } from "./frame-fetcher.machine";
import Konva from "konva";
import ShortcutManager from "@keybindy/core";
import { bezierPenToolMachine } from "./pen-tool.machine";

type Context = {
  fps: number;
  sceneId: string;
  stageRef: Konva.Stage | null;
  shortcutManager: ShortcutManager;
  layers: Record<string, Konva.Layer>;
};
export const editorMachine = createMachine({
  types: {
    input: {} as { sceneId: string },
    context: {} as Context,
  },
  context: ({ input: { sceneId } }) => ({
    fps: 24,
    sceneId,
    shortcutManager: new ShortcutManager(),
    stageRef: null,
    layers: {
      currentFrame: new Konva.Layer({ id: "current-frame" }),
      currentMask: new Konva.Layer({ id: "current-mask" }),
    },
  }),
  initial: "loading",
  invoke: [
    {
      src: frameFetcherMachine,
      id: "frame-fetcher",
      systemId: "frame-fetcher",
      input: ({ context: { sceneId } }) => ({
        sceneId,
      }),
    },
    // { src: timelineMachine, id: "timeline", systemId: "timeline" },
  ],
  states: {
    loading: {
      on: {
        CONTAINER_MOUNTED: {
          target: "active",
          actions: [
            assign({
              stageRef: ({ event }) =>
                new Konva.Stage({
                  height: 2000,
                  width: 2000,
                  container: event.data.containerId,
                }),
            }),
            ({ context }) => {
              context.stageRef?.add(context.layers.currentFrame);
              context.stageRef?.add(context.layers.currentMask);
            },
          ],
        },
      },
    },
    active: {
      invoke: [
        {
          input: ({ context }) => ({ layerRef: context.layers.currentFrame }),
          id: "frame-renderer",
          src: fromCallback<{ type: "" }, { layerRef: Konva.Layer }>(
            ({ input: { layerRef }, system }) => {
              (
                system.get("frame-fetcher") as ActorRefFromLogic<
                  typeof frameFetcherMachine
                >
              ).subscribe({
                next({ context: { data } }) {
                  if (data instanceof ImageBitmap) {
                    layerRef.removeChildren();
                    layerRef.add(
                      new Konva.Image({
                        x: 0,
                        y: 0,
                        image: data,
                        width: data.width,
                        height: data.height,
                      })
                    );
                    layerRef.batchDraw();
                  }
                },
              });
            }
          ),
        },
        {
          input: ({ context }) => ({ ...context }),
          id: "zoom-handler",
          src: fromCallback<{ type: "" }, Context>(
            ({ input: { stageRef } }) => {
              const handleZoom: Konva.KonvaEventListener<
                Konva.Stage,
                WheelEvent
              > = (event) => {
                event.evt.preventDefault();
                const oldScale = stageRef.scaleX();
                const pointer = stageRef.getPointerPosition();
                if (pointer) {
                  const zoomFactor = event.evt.deltaY > 0 ? 0.9 : 1.1;
                  const newScale = Math.max(
                    0.1,
                    Math.min(oldScale * zoomFactor, 10)
                  );
                  const newPos = {
                    x:
                      pointer.x -
                      ((pointer.x - stageRef.x()) * newScale) / oldScale,
                    y:
                      pointer.y -
                      ((pointer.y - stageRef.y()) * newScale) / oldScale,
                  };
                  stageRef.scale({ x: newScale, y: newScale });
                  stageRef.position({ x: newPos.x, y: newPos.y });
                  // updateGrid();
                  stageRef.batchDraw(); // Optimize by redrawing all layers at once
                }
              };
              stageRef.on("wheel", handleZoom);
              return () => {
                // Clean up event listeners and destroy the stageRef
                stageRef.off("wheel", handleZoom);
              };
            }
          ),
        },
      ],
      type: "parallel",
      states: {
        panning: {
          invoke: {
            input: ({ context }) => ({ ...context }),
            id: "shortcut-handler",
            src: fromCallback<
              { type: "" },
              { shortcutManager: ShortcutManager }
            >(({ input: { shortcutManager }, sendBack }) => {
              shortcutManager.register(
                ["Space"],
                (e) => {
                  if (e.type === "keydown") {
                    sendBack({ type: "PANNING_MODE_ENABLED" });
                  } else {
                    sendBack({ type: "PANNING_MODE_DISABLED" });
                  }
                },
                { preventDefault: true, hold: true }
              );
              shortcutManager.start();

              return () => shortcutManager.disableAll();
            }),
          },
          initial: "inactive",
          states: {
            inactive: {
              on: {
                PANNING_MODE_ENABLED: "active",
              },
            },
            active: {
              on: {
                PANNING_MODE_DISABLED: "inactive",
              },
              entry: ({ context }) => {
                if (context.stageRef) {
                  context.stageRef.draggable(true);
                  context.stageRef.container().style.cursor = "grab";
                }
              },
              exit: ({ context }) => {
                if (context.stageRef) {
                  context.stageRef.draggable(false);
                  context.stageRef.container().style.cursor = "auto";
                }
              },
            },
          },
        },
        mode: {
          initial: "idle",
          states: {
            idle: {
              on: {
                NEW_SHAPE: "editing",
              },
            },
            editing: {
              invoke: {
                src: bezierPenToolMachine,
                input: ({ context }) => ({
                  layerRef: context.layers.currentMask,
                }),
                onDone: {
                  actions: ({ event: { output } }) => console.log(output.curve),
                },
              },
            },
          },
        },
      },
    },
  },
});

// type Context = {
//   timelinector: AnyActorRef;
//   frameFetcherActor: AnyActorRef;
// };

// export const editorMachine = createMachine({
//   types: {
//     input: {} as {
//       sceneId: string;
//     },
//     context: {} as Context,
//   },
//   context: ({ input: { sceneId }, spawn }) => ({
//     fps: 24,
//     timelineActor: spawn(timelineMachine, { systemId: "timeline" }),
//     frameFetcherActor: spawn(frameFetcherMachine, {
//       systemId: "frameFetcher",
//       input: {
//         sceneId,
//       },
//     }),
//   }),
//   states: {
//     active: {
//       invoke: {
//         src: fromCallback<{ type: "any" }, Context>(({ input, sendBack }) => {
//           input.frameFetcherActor.subscribe({
//             next(snapshot) {
//               console.log(snapshot);
//             },
//             error(err) {
//               sendBack({ type: "FATAL_ERROR" });
//             },
//             complete() {
//               // ...
//             },
//           });
//         }),
//         input: ({ context }) => ({ context }),
//       },
//     },
//   },
// });
