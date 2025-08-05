import { useState, useRef, useEffect, type FC, type MouseEvent } from "react";

// Define the type for the App component
export const Timeline: FC = () => {
  // Use a ref to get access to the timeline DOM element, explicitly typing it
  const timelineRef = useRef<HTMLDivElement>(null);

  // State for the position of the left and right scrubber handles
  const [leftValue, setLeftValue] = useState<number>(5);
  const [rightValue, setRightValue] = useState<number>(25);

  // State to track which handle is being dragged
  const [isDraggingLeft, setIsDraggingLeft] = useState<boolean>(false);
  const [isDraggingRight, setIsDraggingRight] = useState<boolean>(false);

  // Set up event listeners for mouse move and mouse up on the window
  // to handle dragging logic
  useEffect(() => {
    // Handler for mouse movement, explicitly typing the event
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      // If either handle is being dragged
      if (isDraggingLeft || isDraggingRight) {
        // Ensure the timelineRef is available before proceeding
        if (!timelineRef.current) return;

        // Get the bounding rectangle of the timeline to calculate positions
        const timelineRect = timelineRef.current.getBoundingClientRect();
        const timelineWidth = timelineRect.width;
        const timelineLeft = timelineRect.left;

        // Calculate the new mouse position relative to the timeline
        let newX: number = e.clientX - timelineLeft;

        // Clamp the new position within the timeline bounds
        newX = Math.max(0, Math.min(newX, timelineWidth));

        // Convert the pixel position back to a value on the scale (1-30)
        const newValue: number = (newX / timelineWidth) * 30;

        if (isDraggingLeft) {
          // Update the left value, ensuring it doesn't go past the right value
          setLeftValue(Math.min(newValue, rightValue - 1));
        } else if (isDraggingRight) {
          // Update the right value, ensuring it doesn't go past the left value
          setRightValue(Math.max(newValue, leftValue + 1));
        }
      }
    };

    // Handler for mouse up to stop dragging, explicitly typing the event
    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    // Add event listeners when dragging starts
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    // Clean up event listeners when the component unmounts
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight, leftValue, rightValue]); // Dependencies for useEffect

  // Calculate the left and right positions in percentage for the handles
  const leftPos: number = (leftValue / 30) * 100;
  const rightPos: number = (rightValue / 30) * 100;

  // The range of the timeline (the green line)
  const rangeWidth: number = rightPos - leftPos;
  const rangeLeft: number = leftPos;

  // Render the component
  return (
    <div className="w-full h-full bg-zinc-900 rounded-lg p-6 shadow-xl">
      {/* Timeline scale numbers */}
      <div className="relative flex justify-between px-2 sm:px-4">
        {[...Array(16)].map((_, i: number) => (
          <span
            key={i}
            className="text-zinc-400 text-xs sm:text-sm font-semibold -mt-2"
          >
            {i * 2 + 1}
          </span>
        ))}
      </div>

      {/* Main timeline track and scrubbers */}
      <div
        ref={timelineRef}
        className="relative w-full h-16 flex items-center mt-4"
      >
        {/* Vertical markers */}
        {[...Array(30)].map((_, i: number) => (
          <div
            key={i}
            className="absolute h-full w-[1px] bg-zinc-700"
            style={{ left: `${(i / 29) * 100}%` }}
          />
        ))}

        {/* The green active range line */}
        <div
          className="absolute h-1 bg-green-500 rounded-full transition-all duration-100 ease-linear"
          style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }}
        />

        {/* Left scrubber handle */}
        <div
          className="absolute -ml-3 cursor-pointer group"
          style={{ left: `${leftPos}%` }}
          onMouseDown={(e: MouseEvent) => {
            e.preventDefault();
            setIsDraggingLeft(true);
          }}
        >
          {/* Scrubber diamond shape */}
          <svg
            className="w-6 h-6 text-green-500 transition-transform group-hover:scale-110"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 2L2 12L12 22L22 12L12 2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Right scrubber handle */}
        <div
          className="absolute -ml-3 cursor-pointer group"
          style={{ left: `${rightPos}%` }}
          onMouseDown={(e: MouseEvent) => {
            e.preventDefault();
            setIsDraggingRight(true);
          }}
        >
          {/* Scrubber diamond shape */}
          <svg
            className="w-6 h-6 text-green-500 transition-transform group-hover:scale-110"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 2L2 12L12 22L22 12L12 2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
