import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper function to format the timestamp
export const formatDate = (date: Date) => {
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
};

export async function createImageBitmapFromBase64(
  base64String: string,
  mimeType = "image/png"
) {
  // 1. Decode the Base64 string
  const decodedData = atob(base64String.split(",")[1]); // Remove "data:image/png;base64," prefix if present

  // Convert the decoded string to a Uint8Array
  const byteCharacters = decodedData
    .split("")
    .map((char) => char.charCodeAt(0));
  const byteArray = new Uint8Array(byteCharacters);

  // 2. Create a Blob
  const blob = new Blob([byteArray], { type: mimeType });

  // 3. Create ImageBitmap
  try {
    const imageBitmap = await createImageBitmap(blob);
    return imageBitmap;
  } catch (error) {
    console.error("Error creating ImageBitmap:", error);
    return null;
  }
}

// Example usage:
// const base64Image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";
// createImageBitmapFromBase64(base64Image, 'image/png').then(imageBitmap => {
//   if (imageBitmap) {
//     // Use the imageBitmap, e.g., draw it on a canvas
//     const canvas = document.createElement('canvas');
//     canvas.width = imageBitmap.width;
//     canvas.height = imageBitmap.height;
//     const ctx = canvas.getContext('2d');
//     ctx.drawImage(imageBitmap, 0, 0);
//     document.body.appendChild(canvas);
//   }
// });

/**
 * Converts an array of ImageBitmap objects into an array of base64 strings.
 * This is done efficiently using a single OffscreenCanvas to avoid blocking the main thread.
 *
 * @param {ImageBitmap[]} bitmaps The array of ImageBitmap objects to convert.
 * @returns {Promise<string[]>} A promise that resolves to an array of base64 strings.
 */
export const convertBitmapsToBase64 = async (
  bitmaps: ImageBitmap[]
): Promise<string[]> => {
  const results = [];
  const offscreenCanvas = new OffscreenCanvas(1, 1);
  const ctx = offscreenCanvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get 2D rendering context from OffscreenCanvas.");
  }

  // Process each bitmap sequentially to avoid re-sizing the canvas unnecessarily
  for (const bitmap of bitmaps) {
    // Set the canvas dimensions to match the current bitmap
    offscreenCanvas.width = bitmap.width;
    offscreenCanvas.height = bitmap.height;

    // Draw the bitmap onto the OffscreenCanvas
    ctx.drawImage(bitmap, 0, 0);

    // Convert the OffscreenCanvas to a blob asynchronously
    const blob = await offscreenCanvas.convertToBlob({ type: "image/png" });

    // Convert the blob to a base64 string
    const base64String = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read blob as string."));
        }
      };
      reader.onerror = (e) =>
        reject(new Error(`Failed to read blob: ${e.target?.error?.message}`));
      reader.readAsDataURL(blob);
    });

    results.push(base64String);
  }

  return results;
};
