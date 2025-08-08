import { useEffect, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  currentFrameIndexAtom,
  framesAtom,
  updateCurrentTimeSecondsAtom,
} from "@/lib/shared-state";
import { Images } from "lucide-react";

const isPlayingAtom = atom<boolean>(false);

// Main App component for the video frame player
export function Canvas() {
  const frames = useAtomValue(framesAtom);
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

  return frames.length > 0 ? (
    <div className="w-full flex flex-col items-center">
      {/* Canvas for rendering the video frames */}
      <div className="relative w-full max-w-full overflow-hidden rounded-lg shadow-xl mb-4">
        <canvas
          ref={canvasRef}
          className="w-full h-auto bg-black rounded-lg"
        ></canvas>
      </div>
    </div>
  ) : (
    <ImportModal />
  );
}

export const ImportModal = () => {
  const setFrames = useSetAtom(framesAtom);
  const setCurrentTimeMilliseconds = useSetAtom(updateCurrentTimeSecondsAtom);
  const [_, setIsPlaying] = useAtom(isPlayingAtom);

  // Function to handle the directory selection and load image frames
  const selectDirectory = useCallback(async () => {
    setFrames([]);
    setCurrentTimeMilliseconds(0);
    setIsPlaying(false);

    try {
      // Use the FileSystemAccess API to get a directory handle
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker();
      if (!dirHandle) {
        // TODO: Show toast
        // setStatus("Directory selection cancelled.");
        return;
      }

      const loadedFrames = [];

      // Iterate over the files in the directory
      for await (const entry of dirHandle.values()) {
        if (entry.kind === "file") {
          // Check for common image file extensions
          const fileName = entry.name.toLowerCase();
          if (
            fileName.endsWith(".jpg") ||
            fileName.endsWith(".jpeg") ||
            fileName.endsWith(".png")
          ) {
            const file = await entry.getFile();
            loadedFrames.push(file);
          }
        }
      }

      // Sort frames alphabetically to ensure correct sequence
      loadedFrames.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );

      // Process files into ImageBitmap for efficient rendering
      const imageBitmaps = await Promise.all(
        loadedFrames.map((file) => createImageBitmap(file))
      );

      setFrames(imageBitmaps);
      if (imageBitmaps.length > 0) {
        // setStatus(`Loaded ${imageBitmaps.length} frames.`);
      } else {
        // setStatus("No image frames found in the selected directory.");
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // setStatus("Directory selection cancelled.");
      } else {
        console.error("Error selecting directory:", err);
        // setStatus("An error occurred. Please try again.");
      }
    }
  }, []);
  return (
    <div className="bg-zinc-800  w-full flex flex-col  justify-center  gap-4 items-center">
      <Images size={72} className="text-zinc-600" />
      {/* Directory selection button */}
      <Button variant={"default"} onClick={selectDirectory}>
        Import Scene
      </Button>
    </div>
  );
};

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
