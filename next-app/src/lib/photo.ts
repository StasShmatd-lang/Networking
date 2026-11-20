const MAX_SIDE = 360;
const TARGET_CHARS = 90_000;
const HARD_LIMIT_CHARS = 140_000;

/** Compress a guest photo to a small JPEG data-URL for faster poll payloads. */
export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Нужно изображение");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let quality = 0.72;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > TARGET_CHARS && quality > 0.38) {
    quality -= 0.08;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > HARD_LIMIT_CHARS) throw new Error("Фото слишком большое — попробуйте другое");
  return out;
}
