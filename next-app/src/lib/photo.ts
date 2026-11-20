// Avatars are shown at 48–112 px; 320 px is sharp on retina and stays ~20–40 KB.
const MAX_SIDE = 320;
const TARGET_CHARS = 50_000;
const HARD_LIMIT_CHARS = 140_000;

/** Compress a guest photo to a small JPEG data-URL for faster poll payloads. */
/** createImageBitmap first; <img> fallback for older iPhones and odd camera/gallery files. */
async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("Не получилось открыть фото — выберите другое");
    }
  }
}

export async function fileToDataUrl(file: File): Promise<string> {
  // Some phones give gallery/camera files an empty type — let the decoder decide.
  if (file.type && !file.type.startsWith("image/")) throw new Error("Нужно изображение");
  const bitmap = await decodeImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.drawImage(bitmap.source, 0, 0, w, h);
  bitmap.done();

  let quality = 0.7;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > TARGET_CHARS && quality > 0.38) {
    quality -= 0.08;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > HARD_LIMIT_CHARS) throw new Error("Фото слишком большое — попробуйте другое");
  return out;
}
