import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker from CDN
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

// Constants
const TARGET_DPI = 200;
const MAX_FILE_SIZE_MB = 20;

export interface PDFExtractionResult {
  imageBlob: Blob;
  width: number;
  height: number;
  format: string;
  method: "raw" | "canvas";
}

export interface PDFExtractionError {
  code: string;
  message: string;
}

/**
 * Extracts the first embedded image from a PDF file.
 * Attempts raw extraction first (preserves quality), falls back to canvas render.
 */
export async function extractImageFromPDF(
  file: File
): Promise<PDFExtractionResult> {
  // Validate file size
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    throw createError(
      "FILE_TOO_LARGE",
      `PDF file is too large (${fileSizeMB.toFixed(1)}MB). Maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`
    );
  }

  // Validate file type
  if (file.type !== "application/pdf") {
    throw createError("INVALID_FILE_TYPE", "Please select a valid PDF file.");
  }

  try {
    // Load PDF document
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    if (pdf.numPages === 0) {
      throw createError("EMPTY_PDF", "The PDF file is empty (no pages found).");
    }

    // Get first page
    const page = await pdf.getPage(1);

    // Try raw image extraction first
    try {
      const rawResult = await extractRawImage(page);
      if (rawResult) {
        console.log("✅ Raw image extraction successful");
        return rawResult;
      }
    } catch (rawError) {
      console.warn("Raw extraction failed, falling back to canvas:", rawError);
    }

    // Fallback to canvas rendering
    console.log("⚠️ Falling back to canvas rendering");
    const canvasResult = await extractViaCanvas(page);
    return canvasResult;
  } catch (error) {
    if (isExtractionError(error)) {
      throw error;
    }

    // Handle PDF.js specific errors
    if (error instanceof Error) {
      if (error.message.includes("Invalid PDF")) {
        throw createError(
          "INVALID_PDF",
          "The file appears to be corrupted or is not a valid PDF."
        );
      }
      if (error.message.includes("password")) {
        throw createError(
          "PASSWORD_PROTECTED",
          "This PDF is password protected. Please provide an unprotected PDF."
        );
      }
      if (error.message.includes("worker")) {
        throw createError(
          "WORKER_FAILED",
          "PDF processing failed to initialize. Please refresh the page and try again."
        );
      }
    }

    throw createError(
      "EXTRACTION_FAILED",
      "Failed to extract image from PDF. Please try a different file."
    );
  }
}

/**
 * Extracts raw embedded image from PDF page using operator list.
 * This preserves the original image quality without re-encoding.
 */
async function extractRawImage(
  page: pdfjsLib.PDFPageProxy
): Promise<PDFExtractionResult | null> {
  const operatorList = await page.getOperatorList();
  const { OPS } = pdfjsLib;

  // Find image paint operations
  for (let i = 0; i < operatorList.fnArray.length; i++) {
    if (operatorList.fnArray[i] === OPS.paintImageXObject) {
      const imageName = operatorList.argsArray[i][0];

      try {
        // Get the image object from page resources
        const objs = page.objs;
        const imgData = objs.get(imageName);

        if (imgData && imgData.data) {
          // Check if it's a JPEG image (most common in scanned PDFs)
          const isJpeg = checkIfJpeg(imgData);

          if (isJpeg && imgData.data instanceof Uint8ClampedArray) {
            // For raw JPEG data, convert to PNG at target DPI
            const pngBlob = await convertImageDataToPng(
              imgData.data,
              imgData.width,
              imgData.height
            );

            return {
              imageBlob: pngBlob,
              width: imgData.width,
              height: imgData.height,
              format: "png",
              method: "raw",
            };
          }

          // For other image formats, try to extract directly
          if (imgData.data.length > 0) {
            const pngBlob = await convertImageDataToPng(
              imgData.data,
              imgData.width,
              imgData.height
            );

            return {
              imageBlob: pngBlob,
              width: imgData.width,
              height: imgData.height,
              format: "png",
              method: "raw",
            };
          }
        }
      } catch (imgError) {
        console.warn(`Failed to extract image ${imageName}:`, imgError);
        continue;
      }
    }
  }

  return null;
}

/**
 * Fallback: Renders PDF page to canvas and extracts as PNG.
 * Lower quality than raw extraction but works for all PDFs.
 */
async function extractViaCanvas(
  page: pdfjsLib.PDFPageProxy
): Promise<PDFExtractionResult> {
  // Calculate scale for target DPI (PDF default is 72 DPI)
  const scale = TARGET_DPI / 72;
  const viewport = page.getViewport({ scale });

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const context = canvas.getContext("2d");
  if (!context) {
    throw createError(
      "CANVAS_ERROR",
      "Failed to create canvas context for PDF rendering."
    );
  }

  // Render page to canvas
  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  // Convert canvas to PNG blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error("Failed to convert canvas to blob"));
        }
      },
      "image/png",
      1.0
    );
  });

  return {
    imageBlob: blob,
    width: canvas.width,
    height: canvas.height,
    format: "png",
    method: "canvas",
  };
}

/**
 * Converts raw image data (RGBA) to PNG blob using canvas.
 */
async function convertImageDataToPng(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw createError("CANVAS_ERROR", "Failed to create canvas for image conversion.");
  }

  // Create ImageData from raw bytes
  // PDF.js returns data in RGB or RGBA format
  let imageData: ImageData;

  if (data.length === width * height * 4) {
    // RGBA format
    imageData = new ImageData(new Uint8ClampedArray(data), width, height);
  } else if (data.length === width * height * 3) {
    // RGB format - convert to RGBA
    const rgbaData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgbaData[j] = data[i]; // R
      rgbaData[j + 1] = data[i + 1]; // G
      rgbaData[j + 2] = data[i + 2]; // B
      rgbaData[j + 3] = 255; // A (fully opaque)
    }
    imageData = new ImageData(rgbaData, width, height);
  } else {
    // Grayscale or other format - try to handle
    const rgbaData = new Uint8ClampedArray(width * height * 4);
    const bytesPerPixel = Math.floor(data.length / (width * height));

    if (bytesPerPixel === 1) {
      // Grayscale
      for (let i = 0, j = 0; i < data.length; i++, j += 4) {
        rgbaData[j] = data[i]; // R
        rgbaData[j + 1] = data[i]; // G
        rgbaData[j + 2] = data[i]; // B
        rgbaData[j + 3] = 255; // A
      }
    } else {
      throw createError(
        "UNSUPPORTED_FORMAT",
        `Unsupported image format (${bytesPerPixel} bytes per pixel).`
      );
    }
    imageData = new ImageData(rgbaData, width, height);
  }

  ctx.putImageData(imageData, 0, 0);

  // Convert to PNG blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(createError("CONVERSION_FAILED", "Failed to convert image to PNG."));
        }
      },
      "image/png",
      1.0
    );
  });
}

/**
 * Checks if image data appears to be JPEG based on common characteristics.
 */
function checkIfJpeg(imgData: { data?: unknown; kind?: number }): boolean {
  // PDF.js uses kind property to indicate image type
  // kind 1 = grayscale, kind 2 = RGB, kind 3 = RGBA
  if (imgData.kind && (imgData.kind === 2 || imgData.kind === 3)) {
    return true;
  }
  return false;
}

/**
 * Creates a structured extraction error.
 */
function createError(code: string, message: string): PDFExtractionError {
  return { code, message };
}

/**
 * Type guard for extraction errors.
 */
function isExtractionError(error: unknown): error is PDFExtractionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
}

/**
 * Converts a Blob to a File object for sending to OCR.
 */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}
