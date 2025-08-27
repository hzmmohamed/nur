import { createMachine, assign, fromCallback } from "xstate";
import Konva from "konva";

// Types
interface Point {
  x: number;
  y: number;
}

interface BezierPoint {
  anchor: Point;
  control1: Point | null;
  control2: Point | null;
  type: "move" | "curve";
}

interface BezierPenContext {
  layer: Konva.Layer;
  currentPath: Konva.Path | null;
  points: BezierPoint[];
  tempPoints: BezierPoint[];
  selectedPoint: number | null;
  selectedControl: string | null;
  isDrawing: boolean;
  pathGroup: Konva.Group | null;
  controlsGroup: Konva.Group | null;
  previewLine: Konva.Line | null;
  mousePosition: Point;
}

interface StartPathEvent {
  type: "START_PATH";
  x: number;
  y: number;
}

interface ClickEvent {
  type: "CLICK";
  x: number;
  y: number;
}

interface MouseMoveEvent {
  type: "MOUSE_MOVE";
  x: number;
  y: number;
}

interface SelectPointEvent {
  type: "SELECT_POINT";
  pointIndex: number;
}

interface DragAnchorEvent {
  type: "DRAG_ANCHOR";
  pointIndex: number;
  x: number;
  y: number;
}

interface DragControlEvent {
  type: "DRAG_CONTROL";
  pointIndex: number;
  controlType: "control1" | "control2";
  x: number;
  y: number;
}

type BezierPenEvent =
  | StartPathEvent
  | ClickEvent
  | MouseMoveEvent
  | SelectPointEvent
  | DragAnchorEvent
  | DragControlEvent
  | { type: "DOUBLE_CLICK" }
  | { type: "MOUSE_UP" }
  | { type: "MOUSE_DOWN" }
  | { type: "ESCAPE" }
  | { type: "FINISH_PATH" }
  | { type: "DESELECT" }
  | { type: "DELETE_POINT" };

// Helper functions for vector math
const vectorDistance = (p1: Point, p2: Point): number =>
  Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
const vectorSubtract = (p1: Point, p2: Point): Point => ({
  x: p1.x - p2.x,
  y: p1.y - p2.y,
});
const vectorAdd = (p1: Point, p2: Point): Point => ({
  x: p1.x + p2.x,
  y: p1.y + p2.y,
});
const vectorScale = (v: Point, scale: number): Point => ({
  x: v.x * scale,
  y: v.y * scale,
});
const vectorNormalize = (v: Point): Point => {
  const length = Math.sqrt(v.x ** 2 + v.y ** 2);
  return length === 0 ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length };
};

interface Point {
  x: number;
  y: number;
}

/**
 * Mirrors point P3 across the normal line to the vector from P1 to P2 at P2.
 * * The function uses vector math to find the mirrored point in a 2D plane.
 * * @param anchorNext The coordinates of point P1.
 * @param anchorPrev The coordinates of point P2, the pivot point for the line of reflection.
 * @param p3 The coordinates of point P3, the point to be mirrored.
 * @returns The coordinates of the reflected point.
 */
const mirrorControl1ToControl2OfPrevious = (
  anchorNext: Point,
  anchorPrev: Point,
  control1Next: Point
): Point => {
  // 1. Calculate the vector from P1 to P2.
  // This vector defines the direction that the line of reflection is perpendicular to.
  const vDir = {
    x: anchorPrev.x - anchorNext.x,
    y: anchorPrev.y - anchorNext.y,
  };

  // 2. Determine the normal vector to vDir.
  // In 2D, a normal vector is found by swapping the components and negating one.
  // We will use (-dy, dx).
  const vNormal = {
    x: -vDir.y,
    y: vDir.x,
  };

  // 3. Calculate the vector from P2 to P3.
  // This is the vector from the reflection line's pivot to the point to be mirrored.
  const vP2P3 = {
    x: control1Next.x - anchorPrev.x,
    y: control1Next.y - anchorPrev.y,
  };

  // 4. Project vP2P3 onto the normal vector.
  // This projection gives us the component of vP2P3 that is perpendicular to the
  // line of reflection.
  // The formula for vector projection of A onto B is: proj_B(A) = ((A . B) / |B|^2) * B
  const dotProduct = vP2P3.x * vNormal.x + vP2P3.y * vNormal.y;
  const normalMagSq = vNormal.x * vNormal.x + vNormal.y * vNormal.y;

  // Handle the case where P1 and P2 are the same point (normal vector is zero).
  if (normalMagSq === 0) {
    return control1Next; // Cannot reflect, return the original point.
  }

  const projScalar = dotProduct / normalMagSq;
  const vProj = {
    x: projScalar * vNormal.x,
    y: projScalar * vNormal.y,
  };

  // 5. Calculate the reflected vector.
  // The reflected vector is found by subtracting twice the projection from the original vector.
  const vP2P3Reflected = {
    x: vP2P3.x - vProj.x,
    y: vP2P3.y,
  };

  // 6. Calculate the final mirrored point.
  // Add the reflected vector to the pivot point P2.
  const reflectedPoint = {
    x: anchorPrev.x + vP2P3Reflected.x,
    y: anchorPrev.y + vP2P3Reflected.y,
  };

  return reflectedPoint;
};

// Create control point visual
const createControlPoint = (
  x: number,
  y: number,
  radius: number = 4
): Konva.Circle => {
  return new Konva.Circle({
    x,
    y,
    radius,
    fill: "#007bff",
    stroke: "#ffffff",
    strokeWidth: 1,
    draggable: true,
    name: "control-point",
  });
};

// Create control line visual
const createControlLine = (points: number[]): Konva.Line => {
  return new Konva.Line({
    points,
    stroke: "#007bff",
    strokeWidth: 1,
    dash: [4, 4],
    name: "control-line",
  });
};

// Create anchor point visual
const createAnchorPoint = (
  x: number,
  y: number,
  radius: number = 5
): Konva.Circle => {
  return new Konva.Circle({
    x,
    y,
    radius,
    fill: "#ffffff",
    stroke: "#007bff",
    strokeWidth: 2,
    draggable: true,
    name: "anchor-point",
  });
};

export const bezierPenToolMachine = createMachine(
  {
    id: "bezierPenTool",
    types: {
      events: {} as BezierPenEvent,
      context: {} as BezierPenContext,
      input: {} as {
        layerRef: Konva.Layer;
      },
      output: {} as {
        curve: BezierPoint[];
      },
    },
    context: ({ input }) => ({
      layer: input.layerRef,
      currentPath: null,
      points: [], // Array of {anchor, control1, control2, type}
      tempPoints: [],
      selectedPoint: null,
      selectedControl: null,
      isDrawing: false,
      pathGroup: null,
      controlsGroup: null,
      previewLine: null,
      mousePosition: { x: 0, y: 0 },
    }),
    invoke: {
      input: ({ context }) => ({ layer: context.layer }),
      src: fromCallback<{ type: "" }, { layer: Konva.Layer }>(
        ({ input: { layer }, sendBack, self }) => {
          const stage = layer.getStage();
          // Stage event handlers
          stage.on("click", (e) => {
            const pos = stage.getPointerPosition();
            const target = e.target;

            if (target.hasName("anchor-point")) {
              const pointIndex = target.getAttr("pointIndex");
              sendBack({ type: "SELECT_POINT", pointIndex });
            } else if (self._parent?.getSnapshot().matches("drawing")) {
              sendBack({ type: "CLICK", x: pos.x, y: pos.y });
            } else {
              // sendBack({ type: "START_PATH", x: pos.x, y: pos.y });
            }
          });

          stage.on("dblclick", () => {
            sendBack({ type: "DOUBLE_CLICK" });
          });

          stage.on("mousemove", () => {
            const pos = stage.getPointerPosition();
            sendBack({ type: "MOUSE_MOVE", x: pos.x, y: pos.y });
          });

          stage.on("mouseup", () => {
            sendBack({ type: "MOUSE_UP" });
          });

          stage.on("mousedown", () => {
            const pos = stage.getPointerPosition();
            if (self._parent?.getSnapshot().matches("drawing")) {
              sendBack({ type: "MOUSE_DOWN", x: pos.x, y: pos.y });
            } else {
              sendBack({ type: "START_PATH", x: pos.x, y: pos.y });
            }
          });

          // Control point drag handlers
          layer.on("dragmove", (e) => {
            const target = e.target;
            const pos = target.position();

            if (target.hasName("anchor-point")) {
              const pointIndex = target.getAttr("pointIndex");
              sendBack({
                type: "DRAG_ANCHOR",
                pointIndex,
                x: pos.x,
                y: pos.y,
              });
            } else if (target.hasName("control-point")) {
              const pointIndex = target.getAttr("pointIndex");
              const controlType = target.getAttr("controlType");
              sendBack({
                type: "DRAG_CONTROL",
                pointIndex,
                controlType,
                x: pos.x,
                y: pos.y,
              });
            }
          });

          // Keyboard handlers
          document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
              sendBack({ type: "ESCAPE" });
            } else if (e.key === "Delete" || e.key === "Backspace") {
              sendBack({ type: "DELETE_POINT" });
            }
          });
        }
      ),
    },
    initial: "idle",
    output: ({ context }) => ({
      curve: context.points,
    }),
    states: {
      idle: {
        entry: "clearTemp",
        on: {
          START_PATH: {
            target: "drawing",
            actions: ["initializePath", "addFirstPoint"],
          },
          // SELECT_POINT: {
          //   target: "editing",
          //   actions: "selectPoint",
          // },
        },
      },
      drawing: {
        entry: ["showEditingControls"],
        exit: "hideEditingControls",
        initial: "waitingForSecondPoint",
        states: {
          waitingForSecondPoint: {
            on: {
              MOUSE_DOWN: {
                target: "draggingFirstControl",
                actions: ["startFirstControlDrag", "addNextPoint"],
              },
              MOUSE_MOVE: {
                actions: ["updateMousePosition", "updatePreviewLine"],
              },
              ESCAPE: {
                target: "#bezierPenTool.idle",
                actions: "cancelPath",
              },
            },
          },
          draggingFirstControl: {
            entry: "showPreviewCurve",
            on: {
              MOUSE_MOVE: {
                actions: ["updateCurrentControl", "updatePreviewCurve"],
              },
              MOUSE_UP: {
                target: "waitingForNextPoint",
                actions: "finishFirstControl",
              },
            },
          },
          waitingForNextPoint: {
            on: {
              MOUSE_DOWN: {
                target: "draggingControl",
                actions: "addNextPoint",
              },
              DOUBLE_CLICK: {
                target: "#bezierPenTool.idle",
                actions: "finishPath",
              },
              MOUSE_MOVE: {
                actions: ["updateMousePosition", "updatePreviewCurve"],
              },
              ESCAPE: {
                target: "#done",
                actions: "finishPath",
              },
            },
          },
          draggingControl: {
            on: {
              MOUSE_MOVE: {
                actions: ["updateCurrentControl", "updatePreviewCurve"],
              },
              MOUSE_UP: {
                target: "waitingForNextPoint",
                actions: "finishCurrentControl",
              },
            },
          },
        },
        on: {
          "*": {
            actions: ["showEditingControls"],
          },
          FINISH_PATH: {
            target: "idle",
            actions: "finishPath",
          },
        },
      },
      done: {
        id: "done",
        type: "final",
      },
      canceled: {
        id: "canceled",
        type: "final",
      },

      // editing: {
      //   entry: "showEditingControls",
      //   exit: "hideEditingControls",

      //   on: {
      //     DRAG_ANCHOR: {
      //       actions: "updateAnchorPosition",
      //     },
      //     DRAG_CONTROL: {
      //       actions: "updateControlPosition",
      //     },
      //     DESELECT: {
      //       target: "idle",
      //       actions: "deselectPoint",
      //     },
      //     DELETE_POINT: {
      //       actions: "deleteSelectedPoint",
      //     },
      //   },
      // },
    },
  },
  {
    actions: {
      clearTemp: assign({
        tempPoints: [],
        selectedPoint: null,
        selectedControl: null,
        previewLine: null,
      }),

      initializePath: assign(({ context, event }) => {
        const pathGroup = new Konva.Group({ name: "bezier-path" });
        const controlsGroup = new Konva.Group({ name: "bezier-controls" });

        const path = new Konva.Path({
          data: "",
          stroke: "#000000",
          strokeWidth: 2,
          fill: "",
          name: "bezier-curve",
        });

        pathGroup.add(path);
        context.layer!.add(pathGroup);
        context.layer!.add(controlsGroup);

        return {
          currentPath: path,
          pathGroup,
          controlsGroup,
          points: [],
          isDrawing: true,
          mousePosition: event.position || { x: 0, y: 0 },
        };
      }),
      addFirstPoint: assign(({ event }) => {
        const point: BezierPoint = {
          anchor: { x: event.x, y: event.y },
          control1: null,
          control2: null,
          type: "move",
        };

        return {
          points: [point],
          tempPoints: [point],
        };
      }),

      startFirstControlDrag: assign(({ context, event }) => {
        const firstPoint = context.points[0];
        const control2 = { x: event.x, y: event.y };

        return {
          tempPoints: [
            {
              ...firstPoint,
              control2,
              type: "curve" as const,
            },
          ],
        };
      }),

      finishFirstControl: assign(({ context }) => {
        return {
          points: [...context.tempPoints],
        };
      }),

      addNextPoint: assign(({ context, event }) => {
        console.log("adding point", event);
        const lastPoint = context.points[context.points.length - 1];

        // Calculate mirrored control1 from previous point's control2
        let control1: Point | null = null;
        if (lastPoint.control2) {
          const direction = vectorSubtract(
            lastPoint.anchor,
            lastPoint.control2
          );
          control1 = vectorAdd({ x: event.x, y: event.y }, direction);
        }

        const newPoint: BezierPoint = {
          anchor: { x: event.x, y: event.y },
          control1,
          control2: { x: event.x, y: event.y }, // Will be updated during drag
          type: "curve",
        };

        return {
          points: [...context.points, newPoint],
          tempPoints: [...context.points, newPoint],
        };
      }),

      updateCurrentControl: assign(({ context, event }) => {
        const points = [...context.tempPoints];
        const lastPoint = points[points.length - 1];

        lastPoint.control2 = { x: event.x, y: event.y };

        if (points.length == 2) {
          const direction = vectorSubtract(
            lastPoint.anchor,
            lastPoint.control2
          );
          points[1].control1 = vectorAdd(context.mousePosition, direction);

          // Update control 2 of first point
          points[0].control2 = mirrorControl1ToControl2OfPrevious(
            points[1].anchor,
            points[0].anchor,
            points[1].control1
          );
        }

        // Update path preview
        context.currentPath!.data(generateSVGPath(points));
        context.layer!.batchDraw();

        return { tempPoints: points };
      }),

      finishCurrentControl: assign(({ context }) => {
        context.currentPath!.data(generateSVGPath(context.tempPoints));
        context.layer!.batchDraw();

        return {
          points: [...context.tempPoints],
        };
      }),

      updateMousePosition: assign({
        mousePosition: ({ event }) => ({ x: event.x, y: event.y }),
      }),

      showPreviewLine: ({ context }) => {
        if (!context.previewLine && context.points.length > 0) {
          const firstPoint = context.points[0];
          context.previewLine = new Konva.Line({
            points: [
              firstPoint.anchor.x,
              firstPoint.anchor.y,
              firstPoint.anchor.x,
              firstPoint.anchor.y,
            ],
            stroke: "#cccccc",
            strokeWidth: 1,
            dash: [2, 2],
            name: "preview-line",
          });
          context.layer!.add(context.previewLine);
        }
      },

      updatePreviewLine: ({ context }) => {
        if (context.previewLine && context.points.length > 0) {
          const firstPoint = context.points[0];
          context.previewLine.points([
            firstPoint.anchor.x,
            firstPoint.anchor.y,
            context.mousePosition.x,
            context.mousePosition.y,
          ]);
          context.layer!.batchDraw();
        }
      },

      hidePreviewLine: ({ context }) => {
        if (context.previewLine) {
          context.previewLine.destroy();
          context.previewLine = null;
        }
      },

      showPreviewCurve: ({ context }) => {
        // Create preview curve that follows mouse
        if (context.tempPoints.length > 0) {
          context.currentPath!.data(
            generateSVGPath([
              ...context.tempPoints,
              {
                anchor: context.mousePosition,
                control1: context.mousePosition,
                control2: context.mousePosition,
                type: "curve",
              },
            ])
          );
          context.layer!.batchDraw();
        }
      },

      updatePreviewCurve: ({ context }) => {
        if (context.tempPoints.length > 0) {
          const lastPoint = context.tempPoints[context.tempPoints.length - 1];
          let control1 = context.mousePosition;

          // Mirror the last control point
          if (lastPoint.control2) {
            control1 = mirrorControl1ToControl2OfPrevious(
              lastPoint.anchor,
              context.mousePosition,
              lastPoint.control2
            );
          }

          context.currentPath!.data(
            generateSVGPath([
              ...context.tempPoints,
              {
                anchor: context.mousePosition,
                control1,
                control2: context.mousePosition,
                type: "curve",
              },
            ])
          );
          context.layer!.batchDraw();
        }
      },

      hidePreviewCurve: ({ context }) => {
        if (context.currentPath) {
          context.currentPath.data(generateSVGPath(context.points));
          context.layer!.batchDraw();
        }
      },

      finishPath: ({ context }) => {
        if (context.currentPath && context.points.length > 1) {
          context.currentPath.data(generateSVGPath(context.points));
          context.layer!.batchDraw();
        }
      },

      cancelPath: ({ context }) => {
        if (context.pathGroup) {
          context.pathGroup.destroy();
        }
        if (context.controlsGroup) {
          context.controlsGroup.destroy();
        }
        if (context.previewLine) {
          context.previewLine.destroy();
        }
      },

      selectPoint: assign({
        selectedPoint: ({ event }) => event.pointIndex,
      }),

      showEditingControls: ({ context }) => {
        const points = context.isDrawing ? context.tempPoints : context.points;

        if (!points.length) return;

        context.controlsGroup!.destroyChildren();

        points.forEach((point, index) => {
          // Add anchor point
          const anchor = createAnchorPoint(point.anchor.x, point.anchor.y);
          anchor.setAttr("pointIndex", index);
          anchor.setAttr("controlType", "anchor");
          context.controlsGroup!.add(anchor);

          // Add control points and lines
          if (point.control1) {
            const control1 = createControlPoint(
              point.control1.x,
              point.control1.y
            );
            const line1 = createControlLine([
              point.anchor.x,
              point.anchor.y,
              point.control1.x,
              point.control1.y,
            ]);

            control1.setAttr("pointIndex", index);
            control1.setAttr("controlType", "control1");

            context.controlsGroup!.add(line1);
            context.controlsGroup!.add(control1);
          }

          if (point.control2) {
            const control2 = createControlPoint(
              point.control2.x,
              point.control2.y
            );
            const line2 = createControlLine([
              point.anchor.x,
              point.anchor.y,
              point.control2.x,
              point.control2.y,
            ]);

            control2.setAttr("pointIndex", index);
            control2.setAttr("controlType", "control2");

            context.controlsGroup!.add(line2);
            context.controlsGroup!.add(control2);
          }
        });

        context.layer!.batchDraw();
      },

      hideEditingControls: ({ context }) => {
        if (context.controlsGroup) {
          context.controlsGroup.destroyChildren();
          context.layer!.batchDraw();
        }
      },

      updateAnchorPosition: assign(({ context, event }) => {
        const { pointIndex, x, y } = event;
        const points = [...context.points];
        const point = points[pointIndex];

        const deltaX = x - point.anchor.x;
        const deltaY = y - point.anchor.y;

        // Move anchor and its controls
        point.anchor = { x, y };
        if (point.control1) {
          point.control1 = {
            x: point.control1.x + deltaX,
            y: point.control1.y + deltaY,
          };
        }
        if (point.control2) {
          point.control2 = {
            x: point.control2.x + deltaX,
            y: point.control2.y + deltaY,
          };
        }

        // Update path
        context.currentPath!.data(generateSVGPath(points));
        context.layer!.batchDraw();

        return { points };
      }),

      updateControlPosition: assign(({ context, event }) => {
        const { pointIndex, controlType, x, y } = event;
        const points = [...context.points];
        const point = points[pointIndex];

        point[controlType] = { x, y };

        // Mirror control points if needed
        if (controlType === "control2" && point.control1) {
          const direction = vectorSubtract(point.anchor, { x, y });
          const distance = vectorDistance(point.anchor, point.control1);
          const normalizedDirection = vectorNormalize(direction);
          point.control1 = vectorAdd(
            point.anchor,
            vectorScale(normalizedDirection, distance)
          );
        } else if (controlType === "control1" && point.control2) {
          const direction = vectorSubtract(point.anchor, { x, y });
          const distance = vectorDistance(point.anchor, point.control2);
          const normalizedDirection = vectorNormalize(direction);
          point.control2 = vectorAdd(
            point.anchor,
            vectorScale(normalizedDirection, distance)
          );
        }

        // Update path
        context.currentPath!.data(generateSVGPath(points));
        context.layer!.batchDraw();

        return { points };
      }),

      deselectPoint: assign({
        selectedPoint: null,
        selectedControl: null,
      }),

      deleteSelectedPoint: assign(({ context }) => {
        if (context.selectedPoint !== null) {
          const points = context.points.filter(
            (_, index) => index !== context.selectedPoint
          );
          context.currentPath!.data(generateSVGPath(points));
          context.layer!.batchDraw();

          return {
            points,
            selectedPoint: null,
          };
        }
        return {};
      }),
    },
  }
);

// Generate SVG path data from points
function generateSVGPath(points: BezierPoint[]) {
  if (!points.length) return "";

  let path = "";

  points.forEach((point, index) => {
    if (index === 0) {
      path += `M ${point.anchor.x} ${point.anchor.y}`;
    } else {
      const prevPoint = points[index - 1];
      const c1 = prevPoint.control2 || prevPoint.anchor;
      const c2 = point.control1 || point.anchor;

      path += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${point.anchor.x} ${point.anchor.y}`;
    }
  });

  return path;
}
