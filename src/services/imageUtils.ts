/**
 * Compresses an image File in-browser using FileReader, HTMLImageElement, and Canvas,
 * returning a JPEG data URL resized to fit within `maxDimension`.
 */
export async function compressImageFile(
  file: File,
  maxDimension = 720,
  quality = 0.78,
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file as data URL.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('FileReader error while reading image.'));
    };
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode image.'));
    image.src = dataUrl;
  });

  const { naturalWidth, naturalHeight } = img;
  const maxSide = Math.max(naturalWidth, naturalHeight);
  const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
  const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D canvas context.');
  }

  ctx.fillStyle = '#09090B';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL('image/jpeg', quality);
}
