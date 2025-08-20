import React, { useState, useEffect } from "react";

// Main App component for the performance widget.
export const PerfMonitor = () => {
  // State to hold the current memory usage.
  const [memoryUsage, setMemoryUsage] = useState("0 MB");

  // useEffect hook to set up the performance monitoring loop.
  useEffect(() => {
    // The update function to be called every second.
    const updatePerformance = () => {
      // Get memory usage (only available in Chrome-based browsers).
      const memory = window.performance.memory;
      let formattedMemory = "N/A";
      if (memory) {
        // Convert bytes to megabytes and format the string.
        formattedMemory = `${(memory.usedJSHeapSize / (1024 * 1024)).toFixed(
          2
        )} MB`;
      }

      // Update the memory usage state.
      setMemoryUsage(formattedMemory);
    };

    // Start the interval to tick every 1000 milliseconds (1 second).
    const intervalId = setInterval(updatePerformance, 2000);

    // Clean up the interval when the component unmounts.
    return () => clearInterval(intervalId);
  }, []); // The empty dependency array ensures this effect runs only once.

  return (
    <div className="flex items-center space-x-2 text-xs">
      {/* Display memory number and unit */}
      <span className="text-chart-1 ">Memory Usage</span>
      <span className="font-semibold text-red-400">{memoryUsage}</span>
    </div>
  );
};
