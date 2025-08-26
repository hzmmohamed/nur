import { useParams, useRouteContext } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import Konva from "konva";
import { useRef, useState, useLayoutEffect, useEffect } from "react";
import { Stage, Layer, Rect, Text, Line } from "react-konva";

// The main App component that renders the zoomable and pannable canvas using Konva.
export const Canvas = () => {
  // Use a ref to access the Konva Stage element and the container
  const containerRef = useRef(null);
  const stageRef = useRef<Konva.Stage>(null);

  // State to manage the stage's dimensions, position, and scale
  const [stageDimensions, setStageDimensions] = useState({
    width: 800,
    height: 600,
  });
  const [stageScale, setStageScale] = useState(1);
  const [stageX, setStageX] = useState(0);
  const [stageY, setStageY] = useState(0);

  /**
   * useLayoutEffect to handle responsive resizing of the Konva Stage.
   * This ensures the dimensions are calculated before the browser paints.
   */
  useLayoutEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setStageDimensions({
          // @ts-ignore
          width: containerRef.current.clientWidth,
          // @ts-ignore
          height: containerRef.current.clientHeight,
        });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /**
   * Handles the wheel event for zooming in and out.
   * This logic is applied directly to the Konva Stage.
   * @param {object} event The wheel event object from Konva.
   */
  const handleZoom = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault(); // Prevent default browser scroll behavior

    const stage = stageRef.current;
    if (!stage) return;

    // Get the current pointer position relative to the stage
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    if (pointer) {
      // Determine the zoom direction and factor
      const zoomFactor = event.evt.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(oldScale * zoomFactor, 10)); // Clamp scale between 0.1 and 10
      // Calculate the new stage position to "zoom to cursor"
      const newPos = {
        x: pointer.x - ((pointer.x - stage.x()) * newScale) / oldScale,
        y: pointer.y - ((pointer.y - stage.y()) * newScale) / oldScale,
      };

      // Update the state
      setStageScale(newScale);
      setStageX(newPos.x);
      setStageY(newPos.y);
    }
  };

  /**
   * This function provides the drag and drop functionality for the stage.
   * It's a simple way to implement panning.
   * @param {object} event The drag event object from Konva.
   */
  const handleDragMove = (_: Konva.KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    setStageX(stage.x());
    setStageY(stage.y());
  };

  // Function to create the grid lines
  const renderGrid = () => {
    const gridSize = 50;
    // @ts-ignore
    const lines = [];
    const stage = stageRef.current;
    // @ts-ignore
    if (!stage) return lines;
    const stageWidth = stage.width();
    const stageHeight = stage.height();
    const visibleArea = {
      x: -stageX / stageScale,
      y: -stageY / stageScale,
      width: stageWidth / stageScale,
      height: stageHeight / stageScale,
    };

    // Calculate the start and end points for the grid based on the visible area
    const startX = Math.floor(visibleArea.x / gridSize) * gridSize;
    const endX =
      Math.ceil((visibleArea.x + visibleArea.width) / gridSize) * gridSize;
    const startY = Math.floor(visibleArea.y / gridSize) * gridSize;
    const endY =
      Math.ceil((visibleArea.y + visibleArea.height) / gridSize) * gridSize;

    // Create vertical lines
    for (let i = startX; i <= endX; i += gridSize) {
      lines.push(
        <Line
          key={`v${i}`}
          points={[i, startY, i, endY]}
          stroke="#e5e7eb44" // Light gray
          strokeWidth={1}
        />
      );
    }
    // Create horizontal lines
    for (let i = startY; i <= endY; i += gridSize) {
      lines.push(
        <Line
          key={`h${i}`}
          points={[startX, i, endX, i]}
          stroke="#e5e7eb44" // Light gray
          strokeWidth={1}
        />
      );
    }
    return lines;
  };

  // Frame drawing
  const framesFetcherActorRef = useRouteContext({
    from: "/scenes/$id",
    select: ({ frameFetcher }) => frameFetcher,
  });
  const currentFrame = useSelector(framesFetcherActorRef, (snapshot) => {
    return snapshot.context.data;
  });

  const framesLayerRef = useRef<Konva.Layer>(null);
  useEffect(() => {
    if (currentFrame) {
      framesLayerRef.current?.add(
        new Konva.Image({
          x: 0,
          y: 0,
          image: currentFrame,
          width: currentFrame.width,
          height: currentFrame.height,
        })
      );
    }
  }, [currentFrame, framesLayerRef.current]);

  return (
    <div ref={containerRef} className="w-full h-full  overflow-hidden relative">
      <Stage
        ref={stageRef}
        width={stageDimensions.width}
        height={stageDimensions.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stageX}
        y={stageY}
        onWheel={handleZoom}
        draggable
        onDragMove={handleDragMove}
        style={{ cursor: "grab" }}
      >
        <Layer>{renderGrid()}</Layer>
        <Layer ref={framesLayerRef} />
      </Stage>
      {/* Display current scale and position for debugging/user feedback */}
      <div className="absolute top-4 left-4 bg-card text-card-foreground text-xs p-2 rounded-sm opacity-75">
        <p>Scale: {stageScale.toFixed(2)}</p>
        <p>X: {stageX.toFixed(2)}</p>
        <p>Y: {stageY.toFixed(2)}</p>
      </div>
    </div>
  );
};
