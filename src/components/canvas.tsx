import { useEffect, useRef, useCallback } from "react";
import { useAtomValue } from "jotai";
import { currentFrameIndexAtom } from "@/lib/shared-state";

// Main App component for the video frame player
export function Canvas() {
  const frames = [];
  const currentFrameIndex = useAtomValue(currentFrameIndexAtom);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // A ref to store the animation frame ID so we can cancel it
  // const animationFrameId = useRef(null);

  // Function to draw the current frame on the canvas
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const image = frames[Math.floor(currentFrameIndex)];
    if (image instanceof ImageBitmap) {
      // // Set canvas dimensions to match the image
      canvas.width = image.width;
      canvas.height = image.height;

      // Draw the image onto the canvas
      // ctx.clearRect(0, 0, canvas.width, canvas.height);
      console.log(image);
      ctx.drawImage(image, 0, 0);
    }

    // TODO: Raise error
  }, [frames, currentFrameIndex, canvasRef.current]);

  // // Main animation loop
  // const animate = useCallback(() => {
  //   if (isPlaying) {
  //     // Advance to the next frame, looping back to the start if at the end
  //     setCurrentFrameIndex((prevIndex) => (prevIndex + 1) % frames.length);
  //     // Request the next frame
  //     animationFrameId.current = requestAnimationFrame(animate);
  //   }
  // }, [isPlaying, frames.length]);

  // // useEffect to handle the animation loop
  // useEffect(() => {
  //   if (isPlaying && frames.length > 0) {
  //     // Start the animation loop
  //     animationFrameId.current = requestAnimationFrame(animate);
  //   } else {
  //     // Stop the animation loop
  //     cancelAnimationFrame(animationFrameId.current);
  //   }

  //   // Cleanup function to cancel the animation frame on unmount
  //   return () => cancelAnimationFrame(animationFrameId.current);
  // }, [isPlaying, frames.length, animate]);

  // useEffect to draw the current frame whenever the index or frames change
  useEffect(() => {
    console.log(currentFrameIndex);
    drawFrame();
  }, [currentFrameIndex, frames, drawFrame]);

  // Clean up ImageBitmaps to free memory when frames change or component unmounts
  useEffect(() => {
    return () => {
      frames.forEach((bitmap) => bitmap.close());
    };
  }, [frames]);

  return (
    <div className="w-full flex flex-col items-center p-16">
      <div className="relative w-full max-w-full overflow-hidden rounded-lg shadow-xl mb-4">
        <canvas
          ref={canvasRef}
          className="w-full h-auto bg-background rounded-lg"
        />
      </div>
    </div>
  );
}

// {/* Timeline slider and frame counter */}
// <div className="w-full flex items-center mb-4">
//   <span className="text-sm md:text-base text-zinc-300 w-16 text-center">
//     {currentFrameIndex + 1} / {frames.length}
//   </span>
//   <input
//     type="range"
//     min="0"
//     max={frames.length - 1}
//     value={currentFrameIndex}
//     onChange={handleTimelineChange}
//     className="flex-grow mx-4 h-2 bg-zinc-600 rounded-lg appearance-none cursor-pointer"
//   />
// </div>

// {/* Playback controls */}
// <div className="flex justify-center gap-4">
//   <button
//     onClick={handleStop}
//     className="p-3 bg-red-600 hover:bg-red-700 rounded-full shadow-md text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
//     disabled={frames.length === 0}
//   >
//     {/* Stop icon (SVG) */}
//     <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
//       <path
//         fillRule="evenodd"
//         d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
//         clipRule="evenodd"
//       ></path>
//     </svg>
//   </button>
//   <button
//     onClick={handlePause}
//     className="p-3 bg-yellow-500 hover:bg-yellow-600 rounded-full shadow-md text-zinc-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
//     disabled={!isPlaying}
//   >
//     {/* Pause icon (SVG) */}
//     <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
//       <path
//         fillRule="evenodd"
//         d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.5 8.5a.5.5 0 00-1 0v3a.5.5 0 001 0v-3zm4 0a.5.5 0 00-1 0v3a.5.5 0 001 0v-3z"
//         clipRule="evenodd"
//       ></path>
//     </svg>
//   </button>
//   <button
//     onClick={handlePlay}
//     className="p-3 bg-green-500 hover:bg-green-600 rounded-full shadow-md text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
//     disabled={isPlaying || frames.length === 0}
//   >
//     {/* Play icon (SVG) */}
//     <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
//       <path
//         fillRule="evenodd"
//         d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.42a1 1 0 011.89 0l3.053 5a1 1 0 01-1.89.58L10 8.583 7.292 13a1 1 0 01-1.89-.58l3.053-5z"
//         clipRule="evenodd"
//       ></path>
//     </svg>
//   </button>
// </div>
