import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker from CDN
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

// Constants
const MAX_FILE_SIZE_MB = 20;
const MAX_PAGE_COUNT = 20;

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

export interface PDFPageImageResult {
  pageNumber: number;
  imageBlob: Blob;
  width: number;
  height: number;
  format: string;
  method: "canvas";
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
 * Extracts all PDF pages as image blobs using canvas rendering.
 * Use this for multi-page bill uploads where each page is sent to OCR.
 */
export async function extractAllPagesFromPDF(
  file: File
): Promise<PDFPageImageResult[]> {
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    throw createError(
      "FILE_TOO_LARGE",
      `PDF file is too large (${fileSizeMB.toFixed(1)}MB). Maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`
    );
  }

  if (file.type !== "application/pdf") {
    throw createError("INVALID_FILE_TYPE", "Please select a valid PDF file.");
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    if (pdf.numPages === 0) {
      throw createError("EMPTY_PDF", "The PDF file is empty (no pages found).");
    }

    if (pdf.numPages > MAX_PAGE_COUNT) {
      throw createError(
        "TOO_MANY_PAGES",
        `PDF has ${pdf.numPages} pages. Maximum supported pages is ${MAX_PAGE_COUNT}.`
      );
    }

    const pages: PDFPageImageResult[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const canvasResult = await extractViaCanvas(page);
      pages.push({
        pageNumber,
        imageBlob: canvasResult.imageBlob,
        width: canvasResult.width,
        height: canvasResult.height,
        format: canvasResult.format,
        method: "canvas",
      });
    }

    return pages;
  } catch (error) {
    if (isExtractionError(error)) {
      throw error;
    }

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
      "Failed to extract pages from PDF. Please try a different file."
    );
  }
}

/**
 * Extracts raw embedded image from PDF page using stream data.
 * This preserves the original image quality without re-encoding.
 */
async function extractRawImage(
  page: pdfjsLib.PDFPageProxy
): Promise<PDFExtractionResult | null> {
  try {
    console.log(`🔍 Attempting raw image extraction from PDF page...`);

    // Get the page dictionary - access internal properties
    // @ts-expect-error - dict is an internal PDF.js property not exposed in TypeScript types
    const pageDict: Record<string, unknown> = (page as { dict: Record<string, unknown> }).dict;
    if (!pageDict) {
      console.warn(`⚠️ No page dictionary found`);
      return null;
    }

    // Access Resources -> XObject to find images
    // @ts-expect-error - pageDict methods not in types
    const resources = pageDict?.get?.("Resources");
    if (!resources) {
      console.warn(`⚠️ No Resources in page dictionary`);
      return null;
    }

    const xObjects = resources.get?.("XObject");
    if (!xObjects) {
      console.warn(`⚠️ No XObject resources found`);
      return null;
    }

    console.log(`📦 Found XObject resources`);

    // Iterate through XObjects to find images
    const xObjectKeys = xObjects.getKeys?.() || [];
    console.log(`🔎 XObject keys: ${xObjectKeys.join(", ")}`);

    for (const key of xObjectKeys) {
      try {
        const xObject = xObjects.get(key);
        if (!xObject) continue;

        // Check if it's an image (Subtype = Image)
        const subtype = xObject.get?.("Subtype");
        if (subtype?.name !== "Image") {
          console.log(`⏭️ ${key} is not an image (Subtype: ${subtype?.name})`);
          continue;
        }

        console.log(`📸 Found image: ${key}`);

        const width = xObject.get?.("Width");
        const height = xObject.get?.("Height");
        const filter = xObject.get?.("Filter");
        const colorSpace = xObject.get?.("ColorSpace");

        console.log(`📊 Image properties:`, {
          width,
          height,
          filter: filter?.name || filter,
          colorSpace: colorSpace?.name || colorSpace,
        });

        // Try to get the raw stream data
        const stream = xObject.getStream?.();
        if (!stream) {
          console.warn(`⚠️ No stream data for ${key}`);
          continue;
        }

        // Get the raw bytes
        const streamData = await stream.getBytes?.();
        if (!streamData || streamData.length === 0) {
          console.warn(`⚠️ Stream data is empty for ${key}`);
          continue;
        }

        console.log(`� Got raw stream: ${streamData.length} bytes, filter: ${filter?.name || filter}`);

        // If it's JPEG (DCTDecode), we can use it directly
        if (filter?.name === "DCTDecode" || filter === "DCTDecode") {
          console.log(`✨ This is a JPEG! Converting to PNG...`);
          try {
            const pngBlob = await jpegBytesToPng(streamData, width, height);
            return {
              imageBlob: pngBlob,
              width,
              height,
              format: "png",
              method: "raw",
            };
          } catch (jpegError) {
            console.warn(`⚠️ Failed to convert JPEG:`, jpegError);
            continue;
          }
        }

        // For other formats, try to decode as image data
        console.log(`� Attempting to decode ${filter?.name || "raw"} image...`);
        try {
          const pngBlob = await convertImageDataToPng(
            new Uint8ClampedArray(streamData),
            width,
            height
          );
          return {
            imageBlob: pngBlob,
            width,
            height,
            format: "png",
            method: "raw",
          };
        } catch (decodeError) {
          console.warn(`⚠️ Failed to decode image:`, decodeError);
          continue;
        }
      } catch (keyError) {
        console.warn(`⚠️ Error processing XObject ${key}:`, keyError);
        continue;
      }
    }

    console.log(`⚠️ No suitable images found in XObjects`);
    return null;
  } catch (error) {
    console.error(`❌ Raw extraction error:`, error);
    return null;
  }
}

/**
 * Converts raw JPEG bytes to PNG blob.
 */
async function jpegBytesToPng(
  jpegBytes: Uint8Array | ArrayBuffer,
  width: number,
  height: number
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    // Convert bytes to blob - create plain Uint8Array to avoid SharedArrayBuffer issues
    let bytesArray: Uint8Array;
    if (jpegBytes instanceof ArrayBuffer) {
      bytesArray = new Uint8Array(jpegBytes);
    } else if (jpegBytes instanceof Uint8Array) {
      // Create a copy with a plain ArrayBuffer
      const plainBuffer = new ArrayBuffer(jpegBytes.length);
      new Uint8Array(plainBuffer).set(jpegBytes);
      bytesArray = new Uint8Array(plainBuffer);
    } else {
      // Generic Uint8Array-like - convert to plain array then to Uint8Array
      const array = Array.from(jpegBytes as unknown as number[]);
      bytesArray = new Uint8Array(array);
    }
    const jpegBlob = new Blob([bytesArray] as BlobPart[], { type: "image/jpeg" });
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width || img.width;
        canvas.height = height || img.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(createError("CANVAS_ERROR", "Failed to create canvas"));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log(`✅ JPEG converted to PNG: ${(blob.size / 1024).toFixed(2)}KB`);
              resolve(blob);
            } else {
              reject(createError("CONVERSION_FAILED", "Failed to convert to PNG"));
            }
          },
          "image/png",
          0.95
        );
      };

      img.onerror = () => {
        reject(createError("INVALID_IMAGE", "Invalid JPEG data"));
      };

      img.src = reader.result as string;
    };

    reader.onerror = () => {
      reject(createError("READ_ERROR", "Failed to read image blob"));
    };

    reader.readAsDataURL(jpegBlob);
  });
}

/**
 * Fallback: Renders PDF page to canvas and extracts as PNG.
 * Optimized for quality and file size.
 */
async function extractViaCanvas(
  page: pdfjsLib.PDFPageProxy
): Promise<PDFExtractionResult> {
  // Use higher DPI for scanned documents (typical scans are 200-300 DPI)
  const dpi = 250; // 250 DPI is standard for document scanning
  const scale = dpi / 72; // PDF default is 72 DPI
  
  const viewport = page.getViewport({ scale });

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) {
    throw createError(
      "CANVAS_ERROR",
      "Failed to create canvas context for PDF rendering."
    );
  }

  // Enable better rendering
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  console.log(`📐 Rendering PDF to canvas: ${canvas.width}x${canvas.height} (${dpi} DPI)`);
  
  // Render page to canvas
  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  // Convert canvas to PNG with compression (quality 0.9 for better compression)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          console.log(`💾 Canvas PNG: ${canvas.width}x${canvas.height}, ${(b.size / 1024).toFixed(2)}KB`);
          resolve(b);
        } else {
          reject(new Error("Failed to convert canvas to blob"));
        }
      },
      "image/png",
      0.95
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
