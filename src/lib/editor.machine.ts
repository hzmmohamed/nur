import {
  assign,
  createMachine,
  fromCallback,
  sendTo,
  type ActorRefFromLogic,
} from "xstate";
import { frameFetcherMachine } from "./frame-fetcher.machine";
import Konva from "konva";
import ShortcutManager from "@keybindy/core";
import { generateSVGPath } from "./utils";
import VectorDocument from "./masks.store";
import type { IVideoEditingProject } from "./data-model/interface";
import * as Y from "yjs";
import { VideoEditingProject } from "./data-model/impl-yjs-v2";
import { penToolMachine } from "./pen-tool/machine-multiple";
import { BezierLayer, BezierPath } from "./complex-shapes";
import { BezierSyncEngine } from "./sync-engine/engine";
import { attemptAsync } from "es-toolkit";

type Context = {
  fps: number;
  sceneId: string;
  stageRef: Konva.Stage | null;
  shortcutManager: ShortcutManager;
  layers: Record<string, Konva.Layer>;
  masksDocument: VectorDocument;
  projectRef: IVideoEditingProject;
};
const zoomHandlerSubscriber = fromCallback<
  { type: "" },
  Pick<Context, "stageRef">
>(({ input: { stageRef }, sendBack }) => {
  if (!stageRef) return;
  const handleZoom: Konva.KonvaEventListener<Konva.Stage, WheelEvent> = (
    event
  ) => {
    event.evt.preventDefault();
    const oldScale = stageRef.scaleX();
    const pointer = stageRef.getPointerPosition();
    if (pointer) {
      const zoomFactor = event.evt.deltaY > 0 ? 0.95 : 1.05;
      const newScale = Math.max(0.1, Math.min(oldScale * zoomFactor, 10));
      const newPos = {
        x: pointer.x - ((pointer.x - stageRef.x()) * newScale) / oldScale,
        y: pointer.y - ((pointer.y - stageRef.y()) * newScale) / oldScale,
      };
      stageRef.scale({ x: newScale, y: newScale });
      stageRef.fire("scaleChange");
      stageRef.position({ x: newPos.x, y: newPos.y });
      // updateGrid();
      // stageRef.batchDraw(); // Optimize by redrawing all layers at once

      // Send back scale change event
      sendBack({ type: "ZOOM_CHANGED" });
    }
  };

  // Zoom function that maintains center point
  const zoomToStageCenter = (scaleBy: number) => {
    const oldScale = stageRef.scaleX();
    const newScale = oldScale * scaleBy;

    // Get the center point of the visible area
    const stageBox = stageRef.container().getBoundingClientRect();
    const centerX = stageBox.width / 2;
    const centerY = stageBox.height / 2;

    // Get the point in stage coordinates
    const mousePointTo = {
      x: centerX / oldScale - stageRef.x() / oldScale,
      y: centerY / oldScale - stageRef.y() / oldScale,
    };

    // Calculate new position
    const newPos = {
      x: -(mousePointTo.x - centerX / newScale) * newScale,
      y: -(mousePointTo.y - centerY / newScale) * newScale,
    };

    stageRef.scale({ x: newScale, y: newScale });
    stageRef.position(newPos);
    stageRef.batchDraw();
  };

  // Keyboard handler for zoom shortcuts
  const handleKeyboard = (event: KeyboardEvent) => {
    // Check if Ctrl (or Cmd on Mac) is pressed
    if (event.ctrlKey || event.metaKey) {
      // Ctrl + Plus or Ctrl + Equals (zoom in)
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomToStageCenter(1.1);
        sendBack({ type: "ZOOM_CHANGED" });
      }
      // Ctrl + Minus (zoom out)
      else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomToStageCenter(0.9);
        sendBack({ type: "ZOOM_CHANGED" });
      }
      // Ctrl + 0 (reset zoom)
      else if (event.key === "0") {
        event.preventDefault();
        stageRef.scale({ x: 1, y: 1 });
        stageRef.fire("scaleChange");
        stageRef.position({ x: 0, y: 0 });
        sendBack({ type: "ZOOM_CHANGED" });
      }
    }
  };

  // Register event listeners
  stageRef.on("wheel", handleZoom);
  window.addEventListener("keydown", handleKeyboard);

  // Cleanup function
  return () => {
    stageRef.off("wheel", handleZoom);
    window.removeEventListener("keydown", handleKeyboard);
  };
});

export const editorMachine = createMachine({
  types: {
    input: {} as { sceneId: string },
    context: {} as Context,
    events: {} as
      | {
          type: "ZOOM_CHANGED";
          data: {
            newScale: number;
          };
        }
      | {
          type:
            | "CONTAINER_MOUNTED"
            | "TOGGLE_PEN"
            | "PANNING_MODE_ENABLED"
            | "PANNING_MODE_DISABLED";
        },
  },
  context: ({ input: { sceneId } }) => ({
    fps: 24,
    sceneId,
    shortcutManager: new ShortcutManager(),
    stageRef: null,
    layers: {
      currentFrame: new Konva.Layer({ id: "current-frame" }),
      currentMask: new Konva.Layer({ id: "current-mask" }),
      masks: new Konva.Layer({ id: "masks" }),
    },
    masksDocument: new VectorDocument(`masks-${sceneId}`),
    projectRef: new VideoEditingProject(
      new Y.Doc(),
      {},
      { persistenceKey: sceneId }
    ),
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
    {
      src: fromCallback<{ type: "" }, { projectRef: VideoEditingProject }>(
        ({ input }) => {}
      ),
      input: ({ context }) => ({ projectRef: context.projectRef }),
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

              context.masksDocument.createLayer("test");
              context.stageRef?.add(context.layers.masks);

              const layer = new BezierLayer();
              context.stageRef?.add(layer);

              const project = context.projectRef as VideoEditingProject;

              // Create engine
              const engine = new BezierSyncEngine({
                layer,
                project,
              });

              // Add a layer and frame
              // const layer1 = project.addLayer({ name: "Layer 1" });
              // const frame1 = project.addFrame({ index: 0 });

              // Set active context
              engine.setActiveLayerFrame(project.getAllLayers()[0].id, project.getAllFrames()[0].id);

              // Array.from({ length: 10 }).forEach((_, i) => {
              //   // Start drawing
              //   const path = engine.startDrawingPath({
              //     stroke: "#FF0000",
              //     strokeWidth: 2,
              //   });
              //   // Add points
              //   engine.addPointToPath(path.getPathId(), {
              //     position: { x: i * 100, y: i * 100 },
              //     handleIn: null,
              //     handleOut: { angle: 0, distance: 50 },
              //   });

              //   engine.addPointToPath(path.getPathId(), {
              //     position: { x: i * 200, y: i * 150 },
              //     handleIn: { angle: Math.PI, distance: 50 },
              //     handleOut: { angle: 0, distance: 50 },
              //   });

              //   engine.addPointToPath(path.getPathId(), {
              //     position: { x: i * 300, y: i * 100 },
              //     handleIn: { angle: Math.PI, distance: 50 },
              //     handleOut: null,
              //   });

              //   // Finish
              //   engine.finishDrawingPath();
              // });
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
          input: ({ context: { masksDocument, layers } }) => ({
            masksDocument,
            layerRef: layers.masks,
          }),
          id: "masks-renderer",
          src: fromCallback<
            { type: "" },
            Pick<Context, "masksDocument"> & { layerRef: Konva.Layer }
          >(({ input: { layerRef, masksDocument } }) => {
            const drawCurves = (curves) => {
              layerRef.destroyChildren();
              curves?.forEach((c) => {
                layerRef.add(
                  new Konva.Path({
                    data: generateSVGPath(c.toJSON()),
                    stroke: "oklch(0.9247 0.1 66.1732)",
                    fillEnabled: true,
                    fill: "oklch(0.9247 0.0524 66.1732)",
                    strokeWidth: 1,
                    opacity: 0.6,
                  })
                );
              });
              layerRef.batchDraw();
            };
            drawCurves(masksDocument.getLayer("test")?.get("curves"));
            masksDocument.observeCurves("test", (curves) => {
              console.log(curves);
              drawCurves(curves.target);
            });
          }),
        },
        {
          input: ({ context }) => ({ ...context }),
          id: "zoom-handler",
          src: zoomHandlerSubscriber,
        },
      ],
      type: "parallel",
      states: {
        panning: {
          invoke: [
            {
              input: ({ context }) => ({ ...context }),
              id: "mouse-middle-button-pan-handler",
              systemId: "mouse-middle-button-pan-handler",
              src: fromCallback<{ type: "" }, Pick<Context, "stageRef">>(
                ({ input: { stageRef }, sendBack }) => {
                  if (!stageRef) return;
                  // Handle mouse down event
                  stageRef.on("mousedown", function (e) {
                    // Check if middle mouse button (button 1) is pressed
                    if (e.evt.button === 1) {
                      e.evt.preventDefault();
                      sendBack({ type: "PANNING_MODE_ENABLED" });
                    }
                  });

                  // Handle mouse up event
                  stageRef.on("mouseup", function (e) {
                    if (e.evt.button === 1) {
                      sendBack({ type: "PANNING_MODE_DISABLED" });
                    }
                  });

                  // Handle mouse leave event (stop dragging if mouse leaves stage)
                  stageRef.on("mouseleave", function () {
                    sendBack({ type: "PANNING_MODE_DISABLED" });
                  });

                  // Optional: Handle drag events for additional functionality
                  stageRef.on("dragstart", function () {
                    console.log("Stage drag started");
                  });

                  stageRef.on("dragend", function () {
                    sendBack({ type: "PANNING_MODE_DISABLED" });
                  });

                  // Optional: Handle context menu to prevent it from appearing on middle click
                  stageRef.on("contextmenu", function (e) {
                    e.evt.preventDefault();
                  });

                  () => {
                    stageRef.off("mousedown");
                    stageRef.off("mouseup");
                    stageRef.off("mouseleave");
                    stageRef.off("dragstart");
                    stageRef.off("dragmove");
                    stageRef.off("contextmenu");
                  };
                }
              ),
            },
            // {
            //   input: ({ context }) => ({ ...context }),
            //   id: "shortcut-handler",
            //   systemId: "shortcut-handler",
            //   src: fromCallback<
            //     { type: "" },
            //     { shortcutManager: ShortcutManager }
            //   >(({ input: { shortcutManager }, sendBack }) => {
            //     shortcutManager.register(
            //       ["Space"],
            //       (e) => {
            //         if (e.type === "keydown") {
            //           sendBack({ type: "PANNING_MODE_ENABLED" });
            //         } else {
            //           sendBack({ type: "PANNING_MODE_DISABLED" });
            //         }
            //       },
            //       { preventDefault: true, hold: true }
            //     );
            //     shortcutManager.start();

            //     return () => shortcutManager.disableAll();
            //   }),
            // },
          ],
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
              entry: ({ context: { stageRef } }) => {
                if (stageRef) {
                  stageRef.draggable(true);
                  stageRef.on("dragend", (e) => {
                    console.log(
                      e.currentTarget.position(),
                      e.currentTarget.x(),
                      e.currentTarget.y()
                    );
                  });
                  stageRef.container().style.cursor = "grab";
                }
              },
              exit: ({ context: { stageRef } }) => {
                if (stageRef) {
                  stageRef.draggable(false);
                  stageRef.off("dragend", (e) => {
                    console.log(e.currentTarget.x(), e.currentTarget.y());
                  });
                  stageRef.container().style.cursor = "auto";
                }
              },
            },
          },
        },
        selectedTool: {
          initial: "select",
          states: {
            select: {
              on: {
                TOGGLE_PEN: "pen",
              },
            },
            pen: {
              // invoke: {
              //   src: penToolStateMachine,
              //   input: ({ context }) => ({
              //     penTool: new PenTool(context.stageRef, context.projectRef),
              //   }),
              // },
              on: {
                TOGGLE_PEN: "select",
                ZOOM_CHANGED: {
                  // actions: [forwardTo("bezier-machine")],
                },
                PANNING_MODE_ENABLED: {
                  actions: [sendTo("bezier-machine", { type: "PAUSE" })],
                },
                PANNING_MODE_DISABLED: {
                  actions: [sendTo("bezier-machine", { type: "RESUME" })],
                },
              },
              exit: ({ context }) => {
                context.layers.currentMask.destroyChildren();
              },
              invoke: [
                {
                  src: penToolMachine,
                  id: "bezier-machine",
                  systemId: "bezier-machine",
                  input: ({ context }) => ({
                    layerRef: context.layers.currentMask,
                    project: context.projectRef,
                  }),
                },
              ],
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
