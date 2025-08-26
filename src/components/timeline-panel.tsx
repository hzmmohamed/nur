import { useState, useRef, useEffect, useCallback } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { updateCurrentTimeSecondsAtom } from "@/lib/shared-state";
import { atom, useAtom } from "jotai";
import { ResizablePanel } from "./ui/resizable";
import { MenuIcon } from "lucide-react";
import { useParams, useRouteContext } from "@tanstack/react-router";
import { myStore, MyStoreReact } from "@/lib/store";
import { ImportFramesButton } from "./import-frames-dialog";

const zoomLevelAtom = atom<number>(1);
export const TimelinePanel = () => {
  const framesFetcherActorRef = useRouteContext({
    from: "/scenes/$id",
    select: ({ frameFetcher }) => frameFetcher,
  });

  return (
    <ResizablePanel defaultSize={25}>
      <div id="timeline-header" className="flex h-full flex-col">
        <div className=" bg-background w-full h-16 flex flex-row justify-between items-center px-3 py-1">
          <span className="text-md font-semibold">Timeline</span>
          <div className="flex gap-2 items-center">
            <ImportFramesButton size={"sm"} variant="secondary" />
            <MenuIcon className="size-4" />
          </div>
        </div>
        <Timeline
          onScrub={(frame: number) => {
            console.log(`Scrubbed to frame: ${frame}`);
            framesFetcherActorRef.send({
              type: "FETCH_FRAME",
              key: frame,
            });
          }}
        />
      </div>
    </ResizablePanel>
  );
};

const Timeline = ({ onScrub }: { onScrub: (frameIndex: number) => void }) => {
  const { id } = useParams({ from: "/scenes/$id" });
  const { fps, framesCount } = MyStoreReact.useRow("scenes", id, myStore);
  const timelineLengthSeconds = (framesCount as number) / fps;

  // State for the current playback time in seconds
  const [currentTime, setCurrentTime] = useAtom(updateCurrentTimeSecondsAtom);
  // State for the time shown in the tooltip on hover
  const [hoverTime, setHoverTime] = useState(0);
  // State to track if the mouse is hovering over the timeline
  const [isHovering, setIsHovering] = useState(false);
  // State to track if the user is actively scrubbing (mousedown)
  const [isScrubbing, setIsScrubbing] = useState(false);
  // State for the current zoom level, affecting the timeline's width
  const [zoomLevel, setZoomLevel] = useAtom(zoomLevelAtom);

  // Refs for the canvas element and its 2D drawing context
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // --- Drawing Logic ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const container = timelineContainerRef.current;
    if (!container) return;

    // Set canvas dimensions based on the zoom level
    // const timelineHeight = container.getBoundingClientRect().height * 0.6;
    const timelineHeight = 100;
    const timelineWidth = timelineLengthSeconds * 100 * zoomLevel; // 100px per second at zoom 1

    canvas.width = timelineWidth + 20; // HFA: Quick and dirty hack. 20 pixels added to the width to prevent the current time marker being hidden when drawn at the edge of the canvas
    canvas.height = timelineHeight;

    // Clear the canvas before redrawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Function to draw the timeline elements
    const drawTimeline = () => {
      const barHeight = timelineHeight;
      const barOffset = 24;
      // Draw background
      ctx.fillStyle = "#18181b"; // Tailwind's zinc-900
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw secondary bars (per quarter second)
      ctx.fillStyle = "#52525b"; // Tailwind's zinc-600
      for (let i = 0.25; i < timelineLengthSeconds; i += 0.25) {
        if (i % 1 !== 0) {
          const x = (i / timelineLengthSeconds) * timelineWidth;
          ctx.fillRect(x, barOffset, 1, timelineHeight / 2);
        }
      }

      // Draw primary bars (per second) and labels
      ctx.fillStyle = "#a1a1aa"; // Tailwind's zinc-500
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let i = 0; i <= timelineLengthSeconds; i++) {
        const x = (i / timelineLengthSeconds) * timelineWidth;
        ctx.fillRect(x, barOffset, 1, barHeight);
        if (i > 0) ctx.fillText(`${i}s`, x, 8);
      }

      // Draw the scrubbing highlight
      ctx.fillStyle = "rgba(71, 85, 105, 0.2)"; // Tailwind's slate-600 with opacity
      const highlightWidth =
        (currentTime / timelineLengthSeconds) * timelineWidth;
      ctx.fillRect(0, 0, highlightWidth, barHeight);

      // Draw the current time marker (red line)
      ctx.fillStyle = "#ef4444AA"; // Tailwind's red-500
      const markerX = (currentTime / timelineLengthSeconds) * timelineWidth;
      ctx.fillRect(markerX, 0, 2, timelineHeight);
    };

    drawTimeline();
  }, [timelineLengthSeconds, zoomLevel, currentTime]);

  // --- Event Handlers ---
  const positionToTime = (clientX: number) => {
    if (!canvasRef.current || !timelineContainerRef.current) return 0;
    const { left } = timelineContainerRef.current.getBoundingClientRect();
    // Get the mouse x position relative to the scrollable container's left edge
    const relativeX = clientX - left + timelineContainerRef.current.scrollLeft;
    const newTime =
      (relativeX / canvasRef.current.width) * timelineLengthSeconds;
    return Math.max(0, Math.min(newTime, timelineLengthSeconds));
  };

  const handleMouseMove = (e: any) => {
    if (!canvasRef.current) return;
    const newTime = positionToTime(e.clientX);
    setHoverTime(newTime);
    setIsHovering(true);

    if (isScrubbing) {
      setCurrentTime(newTime);
      if (onScrub) {
        onScrub(Math.floor(newTime * fps));
      }
    }
  };

  const handleMouseDown = (e: any) => {
    e.preventDefault();
    if (e.button === 0) {
      setIsScrubbing(true);
      const newTime = positionToTime(e.clientX);

      setCurrentTime(newTime);
      if (onScrub) {
        onScrub(Math.floor(newTime * fps));
      }
    }
  };

  const handleMouseUp = () => {
    setIsScrubbing(false);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  const handleKeyboardNavigateTimeline = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setCurrentTime(currentTime + 1 / fps);
        onScrub(Math.floor((currentTime + 1 / fps) * fps));
      }
      if (event.key === "ArrowLeft") {
        setCurrentTime(currentTime - 1 / fps);
        onScrub(Math.floor((currentTime - 1 / fps) * fps));
      }
    },
    [currentTime, setCurrentTime, onScrub, fps]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboardNavigateTimeline);
    return () =>
      window.removeEventListener("keydown", handleKeyboardNavigateTimeline);
  }, [handleKeyboardNavigateTimeline]);

  // Attach and clean up global mouse event listeners for scrubbing and wheel events
  useEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) return;

    // Mouse scrubbing events
    if (isScrubbing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    // Zoom with Ctrl + scroll wheel
    const handleWheel = (e: any) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const newZoom =
          e.deltaY < 0
            ? Math.min(5, zoomLevel + zoomSpeed)
            : Math.max(1, zoomLevel - zoomSpeed);
        setZoomLevel(parseFloat(newZoom.toFixed(1)));
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [isScrubbing, zoomLevel]);

  return (
    <>
      <TooltipProvider>
        <Tooltip open={isHovering}>
          <TooltipTrigger asChild>
            <div
              className="w-full h-full bg-popover cursor-ew-resize overflow-x-hidden overflow-y-hidden"
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeave}
            >
              <div
                ref={timelineContainerRef}
                className="mx-8 w-full h-full scrollbar-thin scrollbar-thumb-rounded-full scrollbar-track-rounded-full  scrollbar-thumb-[#d2d2d244] scrollbar-track-[#00000000] bg-card cursor-ew-resize overflow-x-scroll overflow-y-hidden"
              >
                <canvas ref={canvasRef} />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-muted text-popover-foreground p-2 text-xs rounded-md shadow-lg">
            <div>
              <p>Time: {hoverTime.toFixed(2)}s</p>
              <p>Frame: {Math.floor(hoverTime * fps)}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
};
