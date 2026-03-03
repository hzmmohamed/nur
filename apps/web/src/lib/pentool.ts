import Konva from "konva";
import { fromCallback } from "xstate";

interface MouseCursorInput {
  layer: Konva.Layer;
  iconSize?: number;
  iconColor?: string;
}

const mouseCursorActorDOM = fromCallback<{ type: "" }, MouseCursorInput>(
  ({ input }) => {
    const { layer, iconSize = 20, iconColor = "#ffffff" } = input;

    const stage = layer.getStage();
    if (!stage) {
      console.error("Layer must be added to a stage");
      return () => {};
    }

    const container = stage.container();
    const previousCursor = container.style.cursor;

    // Create SVG string with white color
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/>
        <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/>
        <path d="m2.3 2.3 7.286 7.286"/>
        <circle cx="11" cy="11" r="2"/>
      </svg>
    `;

    // Encode SVG to data URI
    const encodedSvg = encodeURIComponent(svgString)
      .replace(/'/g, "%27")
      .replace(/"/g, "%22");

    const dataUri = `data:image/svg+xml,${encodedSvg}`;

    // Set custom cursor with hotspot at 2,2 (the pen tip)
    container.style.cursor = `url("${dataUri}") 2 2, auto`;

    // Cleanup function
    return () => {
      container.style.cursor = previousCursor;
    };
  }
);

const mouseCursorActorKonva = fromCallback<
  { type: "" },
  {
    layer: Konva.Layer;
    iconSize?: number;
    iconColor?: string;
  }
>(({ input }) => {
  const { layer, iconSize = 24, iconColor = "#ffffff" } = input;

  const stage = layer.getStage();
  if (!stage) {
    console.error("Layer must be added to a stage");
    return () => {};
  }

  // Hide default OS cursor
  const container = stage.container();
  const previousCursor = container.style.cursor;
  container.style.cursor = "none";

  // Lucide Pen Tool icon SVG paths
  const penToolPaths = [
    "M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z",
    "M18 13l-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18",
    "M2.3 2.3l7.286 7.286",
  ];

  // Create a group for the cursor
  const cursorGroup = new Konva.Group({
    x: 0,
    y: 0,
    visible: false,
  });

  // Add each path to the group
  penToolPaths.forEach((pathData) => {
    const path = new Konva.Path({
      data: pathData,
      stroke: iconColor,
      strokeWidth: 2,
      lineCap: "round",
      lineJoin: "round",
      scale: { x: iconSize / 24, y: iconSize / 24 },
    });
    cursorGroup.add(path);
  });

  // Add the circle
  const circle = new Konva.Circle({
    x: 11,
    y: 11,
    radius: 2,
    stroke: iconColor,
    strokeWidth: 2,
    scale: { x: iconSize / 24, y: iconSize / 24 },
  });
  cursorGroup.add(circle);

  // Set offset to position tip at cursor point
  cursorGroup.offset({ x: 2, y: 2 });

  // Add cursor group to layer
  layer.add(cursorGroup);
  layer.batchDraw();

  // Mouse move handler
  const handleMouseMove = () => {
    const pointerPosition = stage.getPointerPosition();

    if (pointerPosition) {
      cursorGroup.position({
        x: pointerPosition.x,
        y: pointerPosition.y,
      });
      cursorGroup.visible(true);
      layer.batchDraw();
    }
  };

  // Mouse leave handler
  const handleMouseLeave = () => {
    cursorGroup.visible(false);
    layer.batchDraw();
  };

  // Attach event listeners
  stage.on("mousemove", handleMouseMove);
  stage.on("mouseleave", handleMouseLeave);

  // Cleanup function
  return () => {
    stage.off("mousemove", handleMouseMove);
    stage.off("mouseleave", handleMouseLeave);
    cursorGroup.destroy();
    container.style.cursor = previousCursor; // Restore original cursor
    layer.batchDraw();
  };
});
const mousePointActor = fromCallback<
  { type: "" },
  {
    layer: Konva.Layer;
    pointRadius?: number;
    pointColor?: string;
  }
>(({ input }) => {
  const { layer, pointRadius = 3, pointColor = "#f59e0b" } = input;

  const stage = layer.getStage();
  if (!stage) {
    console.error("Layer must be added to a stage");
    return () => {};
  }

  // Create the point circle
  const point = new Konva.Circle({
    x: 0,
    y: 0,
    radius: pointRadius,
    stroke: pointColor,
    visible: false, // Hidden until first mouse move
  });

  // Add point to layer
  layer.add(point);
  layer.batchDraw();

  // Function to update point scale
  const updatePointScale = () => {
    const scale = stage.scaleX(); // Assuming uniform scaling
    point.scale({ x: 1 / scale, y: 1 / scale });
    layer.batchDraw();
  };

  // Mouse move handler
  const handleMouseMove = () => {
    const pointerPosition = stage.getPointerPosition();

    if (pointerPosition) {
      // Get stage transform
      const scale = stage.scaleX(); // Assuming uniform scaling
      const stagePos = stage.position();

      // Convert screen coordinates to stage coordinates
      const x = (pointerPosition.x - stagePos.x) / scale;
      const y = (pointerPosition.y - stagePos.y) / scale;

      point.position({ x, y });

      // Scale the circle inversely to maintain constant visual size
      point.scale({ x: 1 / scale, y: 1 / scale });

      point.visible(true);
      layer.batchDraw();
    }
  };

  // Mouse leave handler
  const handleMouseLeave = () => {
    point.visible(false);
    layer.batchDraw();
  };

  // Scale change handler
  const handleScaleChange = () => {
    if (point.visible()) {
      updatePointScale();
    }
  };

  // Attach event listeners
  stage.on("mousemove", handleMouseMove);
  stage.on("mouseleave", handleMouseLeave);
  stage.on("scaleChange", handleScaleChange);

  // Cleanup function
  return () => {
    stage.off("mousemove", handleMouseMove);
    stage.off("mouseleave", handleMouseLeave);
    stage.off("scaleChange", handleScaleChange);
    point.destroy();
    layer.batchDraw();
  };
});

export { mouseCursorActorDOM as mouseCursorActor, mousePointActor };
