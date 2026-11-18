// Zpracování obrázků v prohlížeči před nahráním: kontrola vstupu, příprava pro ořez, ořez a zmenšení přes <canvas>.
// Výstup je WebP (kde to prohlížeč umí, jinak JPEG), max. 1600 px na šířku, cíl do 400 kB.

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_OUTPUT_WIDTH = 1600;
const PREVIEW_MAX_SIDE = 2400;
const TARGET_BYTES = 400 * 1024;

export type CropArea = { x: number; y: number; width: number; height: number };

/** Chyba s textem pro uživatele. */
export class ImageError extends Error {}

export function checkInputFile(file: File): void {
  if (!file.type.startsWith("image/")) throw new ImageError("Soubor není obrázek.");
  if (file.size > MAX_INPUT_BYTES) throw new ImageError("Obrázek je příliš velký (nejvýše 10 MB).");
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    // EXIF otočení z telefonu se použije hned při dekódování
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(blob);
    } catch {
      throw new ImageError("Obrázek se nepodařilo načíst. Zkuste jiný soubor (JPEG, PNG nebo WebP).");
    }
  }
}

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("Prohlížeč neumí zpracovat obrázek.");
  ctx.imageSmoothingQuality = "high";
  return [canvas, ctx];
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** WebP s kvalitou 0.82 (nad 400 kB zkusí 0.7); prohlížeč bez WebP kódování dostane JPEG. */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  let blob = await toBlob(canvas, "image/webp", 0.82);
  if (blob && blob.type === "image/webp") {
    if (blob.size > TARGET_BYTES) blob = (await toBlob(canvas, "image/webp", 0.7)) ?? blob;
    return blob;
  }
  blob = await toBlob(canvas, "image/jpeg", 0.82);
  if (blob && blob.size > TARGET_BYTES) blob = (await toBlob(canvas, "image/jpeg", 0.7)) ?? blob;
  if (!blob) throw new ImageError("Obrázek se nepodařilo zmenšit.");
  return blob;
}

/** Obrázek pro ořezávací okno: otočený podle EXIF a zmenšený (max. 2400 px), aby ořez nebyl pomalý. Vrací objektovou adresu. */
export async function prepareForCrop(file: File): Promise<{ url: string; width: number; height: number }> {
  checkInputFile(file);
  const bmp = await decode(file);
  const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const [canvas, ctx] = canvasOf(bmp.width * scale, bmp.height * scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await toBlob(canvas, "image/jpeg", 0.92);
  if (!blob) throw new ImageError("Obrázek se nepodařilo zpracovat.");
  return { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
}

/** Výřez (v pixelech obrázku z `prepareForCrop`) zmenšený na nejvýše 1600 px na šířku. */
export async function cropToBlob(sourceUrl: string, area: CropArea): Promise<Blob> {
  const blob = await (await fetch(sourceUrl)).blob();
  const bmp = await decode(blob);
  const outW = Math.min(MAX_OUTPUT_WIDTH, Math.round(area.width));
  const outH = Math.round((outW * area.height) / area.width);
  const [canvas, ctx] = canvasOf(outW, outH);
  ctx.drawImage(bmp, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return encode(canvas);
}

/** Zmenšení bez ořezu (obrázky v textu): nejvýše 1600 px na šířku. */
export async function resizeToBlob(file: File): Promise<Blob> {
  checkInputFile(file);
  const bmp = await decode(file);
  const scale = Math.min(1, MAX_OUTPUT_WIDTH / bmp.width);
  const [canvas, ctx] = canvasOf(bmp.width * scale, bmp.height * scale);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return encode(canvas);
}

/** Nahraje obrázek na server (multipart); vrací id a adresu uloženého obrázku. */
export async function uploadImage(uploadUrl: string, blob: Blob): Promise<{ id: string; url: string }> {
  const body = new FormData();
  body.append("file", blob, blob.type === "image/webp" ? "obrazek.webp" : "obrazek.jpg");
  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: "POST", body });
  } catch {
    throw new ImageError("Nahrání se nezdařilo (chyba připojení).");
  }
  const json = (await res.json().catch(() => null)) as { id?: string; url?: string; error?: string } | null;
  if (!res.ok || !json?.id || !json.url) throw new ImageError(json?.error ?? "Nahrání se nezdařilo.");
  return { id: json.id, url: json.url };
}
