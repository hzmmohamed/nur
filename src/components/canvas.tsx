import React, {
  useRef,
  useState,
  useLayoutEffect,
  useEffect,
  useCallback,
} from "react";
import Konva from "konva";
import { useRouteContext } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";

// With import
import ShortcutManager from "@keybindy/core";
const manager = new ShortcutManager();

// The main App component that renders the zoomable and pannable canvas using pure Konva.
export const Canvas = () => {
  // Use refs to access the HTML container and to hold the Konva stage and layers
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const gridLayerRef = useRef(null);
  const contentLayerRef = useRef(null);

  // State to manage the stage's dimensions, position, and scale
  const [stageDimensions, setStageDimensions] = useState({
    width: 2000,
    height: 2000,
  });
  const [stageScale, setStageScale] = useState(1);
  const [stageX, setStageX] = useState(0);
  const [stageY, setStageY] = useState(0);
  console.log(stageScale);

  /**
   * useLayoutEffect to handle responsive resizing of the canvas.
   * This ensures the dimensions are calculated before the browser paints.
   */

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      setStageDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
  }, [containerRef.current]);
  useLayoutEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.addEventListener("resize", () => {
        console.log("test");
        handleResize();
      });
    }
  }, [containerRef.current]);

  useEffect(() => {
    manager.register(
      ["Space"],
      (e) => {
        if (e.type === "keydown") {
          stageRef.current.draggable(true);
          stageRef.current.on("mousemove", handleDragMove);
          containerRef.current.style.cursor = "grab";
        } else {
          stageRef.current.draggable(false);
          stageRef.current.off("mousemove", handleDragMove);
          containerRef.current.style.cursor = "auto";
        }
      },
      { preventDefault: true, hold: true }
    );
    manager.start();
  }, []);

  /**
   * useEffect hook to initialize the Konva stage and layers on mount.
   * This runs once and sets up the drawing environment.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stage = new Konva.Stage({
      container: container,
      width: stageDimensions.width,
      height: stageDimensions.height,
    });
    stageRef.current = stage;

    // Create and add layers for different content types
    const gridLayer = new Konva.Layer();
    const contentLayer = new Konva.Layer();
    const framesLayer = new Konva.Layer();

    gridLayerRef.current = gridLayer;
    contentLayerRef.current = contentLayer;
    framesLayerRef.current = framesLayer;

    stage.add(gridLayer, contentLayer, framesLayer);

    // Initial drawing of content
    const rect = new Konva.Rect({
      x: 50,
      y: 50,
      width: 200,
      height: 150,
      fill: "#6366f1",
      shadowBlur: 10,
    });
    contentLayer.add(rect);

    const text = new Konva.Text({
      text: "Hello, Konva!",
      x: 60,
      y: 100,
      fontSize: 24,
      fill: "#1f2937",
    });
    contentLayer.add(text);

    // Event listeners for pan and zoom
    stage.on("wheel", handleZoom);

    return () => {
      // Clean up event listeners and destroy the stage
      stage.off("wheel", handleZoom);
      stage.destroy();
    };
  }, []);

  /**
   * useEffect to update the stage's scale and position whenever state changes.
   * This connects the React state to the imperative Konva instance.
   */
  useEffect(() => {
    const stage = stageRef.current;
    if (stage) {
      stage.scale({ x: stageScale, y: stageScale });
      stage.position({ x: stageX, y: stageY });
      updateGrid();
      stage.batchDraw(); // Optimize by redrawing all layers at once
    }
  }, [stageScale, stageX, stageY]);

  /**
   * Function to update the grid lines based on the current scale and position.
   */
  const updateGrid = () => {
    const stage = stageRef.current;
    const gridLayer = gridLayerRef.current;
    if (!stage || !gridLayer) return;

    gridLayer.destroyChildren(); // Clear existing lines
    const gridSize = 50;
    const stageWidth = stageDimensions.width;
    const stageHeight = stageDimensions.height;
    const visibleArea = {
      x: -stageX / stageScale,
      y: -stageY / stageScale,
      width: stageWidth / stageScale,
      height: stageHeight / stageScale,
    };
    const startX = Math.floor(visibleArea.x / gridSize) * gridSize;
    const endX =
      Math.ceil((visibleArea.x + visibleArea.width) / gridSize) * gridSize;
    const startY = Math.floor(visibleArea.y / gridSize) * gridSize;
    const endY =
      Math.ceil((visibleArea.y + visibleArea.height) / gridSize) * gridSize;

    // Create vertical lines
    for (let i = startX; i <= endX; i += gridSize) {
      const line = new Konva.Line({
        points: [i, startY, i, endY],
        stroke: "#e5e7eb44",
        strokeWidth: 1,
      });
      gridLayer.add(line);
    }
    // Create horizontal lines
    for (let i = startY; i <= endY; i += gridSize) {
      const line = new Konva.Line({
        points: [startX, i, endX, i],
        stroke: "#e5e7eb44",
        strokeWidth: 1,
      });
      gridLayer.add(line);
    }
    gridLayer.batchDraw();
  };

  /**
   * Handles the wheel event for zooming in and out.
   */
  const handleZoom = (event) => {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    console.log(pointer);
    if (pointer) {
      const zoomFactor = event.evt.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(oldScale * zoomFactor, 10));
      const newPos = {
        x: pointer.x - ((pointer.x - stage.x()) * newScale) / oldScale,
        y: pointer.y - ((pointer.y - stage.y()) * newScale) / oldScale,
      };
      setStageScale(newScale);
      setStageX(newPos.x);
      setStageY(newPos.y);
    }
  };

  /**
   * Provides drag and drop functionality for the stage.
   */
  const handleDragMove = () => {
    const stage = stageRef.current;
    setStageX(stage.x());
    setStageY(stage.y());
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
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full overflow-hidden">
        {/* We no longer need this div because the Konva Stage is initialized with a direct container reference */}
        {/* Display current scale and position for debugging/user feedback */}
      </div>
      <div className="absolute top-4 left-4 bg-card text-card-foreground text-xs p-2 rounded-sm opacity-75">
        <p>Scale: {stageScale.toFixed(2)}</p>
        <p>X: {stageX.toFixed(2)}</p>
        <p>Y: {stageY.toFixed(2)}</p>
      </div>
    </div>
  );
};

export default Canvas;
