import { useEffect, useRef } from "react";
import { useSelector } from "@xstate/react";
import { useRouteContext } from "@tanstack/react-router";

// Main App component for the video frame player
export function Canvas() {
  const framesFetcherActorRef = useRouteContext({
    from: "/scenes/$id",
    select: ({ frameFetcher }) => frameFetcher,
  });
  const currentFrame = useSelector(framesFetcherActorRef, (snapshot) => {
    return snapshot.context.data;
  });
  const stateMatches = useSelector(
    framesFetcherActorRef,
    (snapshot) => snapshot.matches
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  console.log("Frame data changed", currentFrame);

  // A ref to store the animation frame ID so we can cancel it
  // const animationFrameId = useRef(null);

  // Function to draw the current frame on the canvas
  // const drawFrame = useCallback(() => {
  //   // TODO: Raise error
  // }, [currentFrame]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (currentFrame instanceof ImageBitmap) {
      // // Set canvas dimensions to match the image
      canvas.width = currentFrame.width;
      canvas.height = currentFrame.height;

      // Draw the image onto the canvas
      // ctx.clearRect(0, 0, canvas.width, canvas.height);
      console.log("drawing frame to canvas");
      ctx.drawImage(currentFrame, 0, 0);
    }
  }, [currentFrame]);

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
