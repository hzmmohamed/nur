import { fromCallback } from "xstate";
import Konva from "konva";

// Renderer actor using Konva instead of canvas API
export const rendererActor = fromCallback(({ receive, input }) => {
  const { layer } = input;
  let currentState = null;

  // Keep track of Konva objects for efficient updates
  let pathObjects = new Map(); // pathId -> Konva.Path
  let controlObjects = new Map(); // controlId -> Konva object
  let previewObjects = new Map(); // preview objects

  // Helper function to convert path points to SVG path data
  const pathToSVG = (path) => {
    if (!path || path.points.length === 0) return "";

    let svgPath = "";
    const points = path.points;

    // Move to first point
    svgPath += `M ${points[0].x} ${points[0].y}`;

    // Draw curves/lines between points
    for (let i = 1; i < points.length; i++) {
      const currentPoint = points[i];
      const previousPoint = points[i - 1];

      if (previousPoint.handleOut || currentPoint.handleIn) {
        // Bezier curve
        const cp1x =
          previousPoint.x +
          (previousPoint.handleOut ? previousPoint.handleOut.x : 0);
        const cp1y =
          previousPoint.y +
          (previousPoint.handleOut ? previousPoint.handleOut.y : 0);
        const cp2x =
          currentPoint.x +
          (currentPoint.handleIn ? currentPoint.handleIn.x : 0);
        const cp2y =
          currentPoint.y +
          (currentPoint.handleIn ? currentPoint.handleIn.y : 0);

        svgPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${currentPoint.x} ${currentPoint.y}`;
      } else {
        // Straight line
        svgPath += ` L ${currentPoint.x} ${currentPoint.y}`;
      }
    }

    // Close path if needed
    if (path.closed && points.length > 2) {
      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];

      if (lastPoint.handleOut || firstPoint.handleIn) {
        // Bezier curve back to start
        const cp1x =
          lastPoint.x + (lastPoint.handleOut ? lastPoint.handleOut.x : 0);
        const cp1y =
          lastPoint.y + (lastPoint.handleOut ? lastPoint.handleOut.y : 0);
        const cp2x =
          firstPoint.x + (firstPoint.handleIn ? firstPoint.handleIn.x : 0);
        const cp2y =
          firstPoint.y + (firstPoint.handleIn ? firstPoint.handleIn.y : 0);

        svgPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${firstPoint.x} ${firstPoint.y}`;
      } else {
        // Straight line back to start
        svgPath += ` L ${firstPoint.x} ${firstPoint.y}`;
      }
      svgPath += " Z";
    }

    return svgPath;
  };

  // Helper function to create or update a path object
  const updatePath = (
    path,
    pathIndex,
    isSelected = false,
    isPreview = false
  ) => {
    const pathId = isPreview ? "preview" : `path_${pathIndex}`;
    const svgData = pathToSVG(path);

    if (!svgData) return;

    let pathObject = pathObjects.get(pathId);

    if (!pathObject) {
      pathObject = new Konva.Path({
        data: svgData,
        stroke: isSelected ? "#f59e0b" : "#3b82f6",
        strokeWidth: 2,
        lineCap: "round",
        lineJoin: "round",
        fill: path.closed ? "rgba(59, 130, 246, 0.1)" : undefined,
        dash: isPreview ? [5, 5] : undefined,
      });
      layer.add(pathObject);
      pathObjects.set(pathId, pathObject);
    } else {
      pathObject.setAttrs({
        data: svgData,
        stroke: isSelected ? "#f59e0b" : "#3b82f6",
        fill: path.closed ? "rgba(59, 130, 246, 0.1)" : undefined,
        dash: isPreview ? [5, 5] : undefined,
      });
    }
  };

  // Helper function to create preview path
  const updatePreviewPath = (path, previewPoint) => {
    if (!path || !previewPoint || path.points.length === 0) {
      // Remove preview if it exists
      const previewPath = pathObjects.get("preview_line");
      if (previewPath) {
        previewPath.destroy();
        pathObjects.delete("preview_line");
      }
      return;
    }

    // Create a temporary path with the preview point
    const tempPath = {
      ...path,
      points: [...path.points, previewPoint],
      closed: false,
    };

    const svgData = pathToSVG(tempPath);
    let previewPath = pathObjects.get("preview_line");

    if (!previewPath) {
      previewPath = new Konva.Path({
        data: svgData,
        stroke: "#3b82f6",
        strokeWidth: 2,
        dash: [5, 5],
        fill: undefined,
      });
      layer.add(previewPath);
      pathObjects.set("preview_line", previewPath);
    } else {
      previewPath.setAttrs({
        data: svgData,
      });
    }
  };

  // Helper function to create/update control points and handles
  const updateControls = (path, pathIndex, selectedPoint, selectedHandle) => {
    if (!path) return;

    // Clear existing controls for this path
    const controlPrefix = `controls_${pathIndex}`;
    for (let [key, obj] of controlObjects) {
      if (key.startsWith(controlPrefix)) {
        obj.destroy();
        controlObjects.delete(key);
      }
    }

    path.points.forEach((point, pointIndex) => {
      const pointId = `${controlPrefix}_point_${pointIndex}`;
      const handleInId = `${controlPrefix}_handleIn_${pointIndex}`;
      const handleOutId = `${controlPrefix}_handleOut_${pointIndex}`;
      const lineInId = `${controlPrefix}_lineIn_${pointIndex}`;
      const lineOutId = `${controlPrefix}_lineOut_${pointIndex}`;

      // Draw handle lines
      if (point.handleIn) {
        const line = new Konva.Line({
          points: [
            point.x,
            point.y,
            point.x + point.handleIn.x,
            point.y + point.handleIn.y,
          ],
          stroke: "#666",
          strokeWidth: 1,
        });
        layer.add(line);
        controlObjects.set(lineInId, line);
      }

      if (point.handleOut) {
        const line = new Konva.Line({
          points: [
            point.x,
            point.y,
            point.x + point.handleOut.x,
            point.y + point.handleOut.y,
          ],
          stroke: "#666",
          strokeWidth: 1,
        });
        layer.add(line);
        controlObjects.set(lineOutId, line);
      }

      // Draw handle points
      if (point.handleIn) {
        const handleX = point.x + point.handleIn.x;
        const handleY = point.y + point.handleIn.y;
        const isSelectedHandle =
          selectedHandle?.pathIndex === pathIndex &&
          selectedHandle?.pointIndex === pointIndex &&
          selectedHandle?.handle === "in";

        const handle = new Konva.Circle({
          x: handleX,
          y: handleY,
          radius: 3,
          fill: isSelectedHandle ? "#f59e0b" : "#666",
          stroke: "white",
          strokeWidth: 1,
        });
        layer.add(handle);
        controlObjects.set(handleInId, handle);
      }

      if (point.handleOut) {
        const handleX = point.x + point.handleOut.x;
        const handleY = point.y + point.handleOut.y;
        const isSelectedHandle =
          selectedHandle?.pathIndex === pathIndex &&
          selectedHandle?.pointIndex === pointIndex &&
          selectedHandle?.handle === "out";

        const handle = new Konva.Circle({
          x: handleX,
          y: handleY,
          radius: 3,
          fill: isSelectedHandle ? "#f59e0b" : "#666",
          stroke: "white",
          strokeWidth: 1,
        });
        layer.add(handle);
        controlObjects.set(handleOutId, handle);
      }

      // Draw main control point
      const isSelectedPoint =
        selectedPoint?.pathIndex === pathIndex &&
        selectedPoint?.pointIndex === pointIndex;

      const controlPoint = new Konva.Circle({
        x: point.x,
        y: point.y,
        radius: 4,
        fill: isSelectedPoint ? "#f59e0b" : "#3b82f6",
        stroke: "white",
        strokeWidth: 2,
      });
      layer.add(controlPoint);
      controlObjects.set(pointId, controlPoint);

      // First point indicator for open paths
      if (pointIndex === 0 && !path.closed) {
        const indicator = new Konva.Circle({
          x: point.x,
          y: point.y,
          radius: 6,
          stroke: "#10b981",
          strokeWidth: 2,
          dash: [2, 2],
        });
        layer.add(indicator);
        controlObjects.set(`${pointId}_indicator`, indicator);
      }
    });
  };

  // Clear all objects from layer
  const clearAll = () => {
    // Destroy all path objects
    for (let [key, obj] of pathObjects) {
      obj.destroy();
    }
    pathObjects.clear();

    // Destroy all control objects
    for (let [key, obj] of controlObjects) {
      obj.destroy();
    }
    controlObjects.clear();

    // Destroy all preview objects
    for (let [key, obj] of previewObjects) {
      obj.destroy();
    }
    previewObjects.clear();
  };

  // Main render function
  const render = (state) => {
    const {
      paths,
      currentPath,
      selectedPath,
      selectedPoint,
      selectedHandle,
      tool,
      previewPoint,
    } = state.context;

    // Clear existing objects
    clearAll();

    // Render completed paths
    paths.forEach((path, pathIndex) => {
      updatePath(path, pathIndex, selectedPath === pathIndex);

      if (
        (tool === "select" || selectedPath === pathIndex) &&
        (selectedPath === pathIndex || tool === "select")
      ) {
        updateControls(path, pathIndex, selectedPoint, selectedHandle);
      }
    });

    // Render current path being drawn
    if (currentPath) {
      if (previewPoint) {
        updatePreviewPath(currentPath, previewPoint);
      } else {
        updatePath(currentPath, -1, false, true);
      }
      updateControls(currentPath, -1, selectedPoint, selectedHandle);
    }

    // Redraw the layer
    layer.batchDraw();
  };

  receive((event) => {
    if (event.type === "RENDER") {
      currentState = event.state;
      render(currentState);
    }
  });

  return () => {
    // Cleanup - destroy all objects
    clearAll();
  };
});
