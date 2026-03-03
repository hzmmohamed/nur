import { fromCallback } from "xstate";
import Konva from "konva";
import type { KonvaEventListener } from "konva/lib/Node";
import type { Stage } from "konva/lib/Stage";

// Types
interface Point {
  x: number;
  y: number;
}

// Helper functions
export const distance = (p1: Point, p2: Point) =>
  Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

export const angle = (p1: Point, p2: Point) =>
  Math.atan2(p2.y - p1.y, p2.x - p1.x);

export const createSymmetricHandle = (
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

// Event types emitted by the canvas event actor
type CanvasEvent =
  | {
      type: "MOUSE_DOWN";
      point: { x: number; y: number } | null;
      altKey: boolean;
      shiftKey: boolean;
    }
  | {
      type: "MOUSE_MOVE";
      point: { x: number; y: number } | null;
      altKey: boolean;
      shiftKey: boolean;
    }
  | {
      type: "MOUSE_UP";
    }
  | {
      type: "UNDO";
    }
  | {
      type: "REDO";
    }
  | {
      type: "KEY_PRESS";
      key: string;
    };

interface CanvasEventInput {
  layer: Konva.Layer;
  enableMouseDown?: boolean;
  enableMouseMove?: boolean;
  enableMouseUp?: boolean;
  enableKeyboard?: boolean;
}

// Canvas event handler actor
const canvasEventActor = fromCallback<{ type: "" }, CanvasEventInput>(
  ({ sendBack, input }) => {
    const {
      layer,
      enableMouseDown = false,
      enableMouseMove = false,
      enableMouseUp = false,
      enableKeyboard = false,
    } = input;

    const stage = layer.getStage();
    if (!stage) {
      console.error("Layer must be added to a stage");
      return () => {};
    }

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

    // Conditionally register event listeners
    if (enableMouseMove) {
      stage.on("mousemove", handleMouseMove);
    }
    if (enableMouseUp) {
      stage.on("mouseup", handleMouseUp);
    }
    if (enableMouseDown) {
      stage.on("mousedown", handleMouseDown);
    }
    if (enableKeyboard) {
      window.addEventListener("keydown", handleKeyDown);
    }

    // Cleanup function - only remove registered listeners
    return () => {
      if (enableMouseMove) {
        stage.off("mousemove", handleMouseMove);
      }
      if (enableMouseUp) {
        stage.off("mouseup", handleMouseUp);
      }
      if (enableMouseDown) {
        stage.off("mousedown", handleMouseDown);
      }
      if (enableKeyboard) {
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  }
);

export { canvasEventActor, type CanvasEvent };
