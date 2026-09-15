/**
 * Client-side image compression utility.
 * Downscales large camera photos to a max dimension (e.g. 1920px) and converts
 * them to modern WebP (with JPEG fallback) at high visual quality.
 *
 * Preserves non-image files, vector SVGs, and animated GIFs without modification.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: 'image/webp' | 'image/jpeg';
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  // Only process raster images; skip SVGs, GIFs, and non-image files
  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif'
  ) {
    return file;
  }

  // Already lightweight (less than 100KB) — skip compression
  if (file.size < 100 * 1024) {
    return file;
  }

  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
    mimeType = 'image/webp',
  } = options;

  try {
    const { source, width, height, cleanup } = await loadImageSource(file);

    try {
      // Calculate target dimensions preserving aspect ratio
      const ratio = Math.min(1, maxWidth / width, maxHeight / height);
      const targetWidth = Math.max(1, Math.round(width * ratio));
      const targetHeight = Math.max(1, Math.round(height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return file;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

      // Attempt WebP first, fallback to JPEG if unsupported
      let blob: Blob | null = await new Promise((resolve) => {
        canvas.toBlob(resolve, mimeType, quality);
      });

      if (!blob || (mimeType === 'image/webp' && blob.type !== 'image/webp')) {
        blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', quality);
        });
      }

      // If compression failed or resulted in a larger file, keep the original
      if (!blob || blob.size >= file.size) {
        return file;
      }

      // Derive proper extension and filename
      const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const newName = `${baseName}${ext}`;

      return new File([blob], newName, {
        type: blob.type,
        lastModified: Date.now(),
      });
    } finally {
      cleanup();
    }
  } catch (err) {
    console.warn('Client-side image compression error, using original file:', err);
    return file;
  }
}

/**
 * Loads an image file using createImageBitmap when available (fast, respects EXIF),
 * falling back to HTMLImageElement.
 */
async function loadImageSource(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to Image element if createImageBitmap fails on specific formats
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    img.src = url;
  });
}
