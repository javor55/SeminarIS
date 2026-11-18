// Rozpoznání nahraného obrázku podle obsahu (ne podle deklarovaného typu): formát a rozměry.
// Čistá logika bez závislostí; umí JPEG, PNG a WebP (VP8, VP8L, VP8X).

export type ImageInfo = { mime: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number };

export const MAX_IMAGE_BYTES = 600 * 1024;
export const MAX_IMAGE_SIDE = 4000;

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));

function png(b: Uint8Array): ImageInfo | null {
  if (b.length < 24 || ascii(b, 1, 3) !== "PNG" || ascii(b, 12, 4) !== "IHDR") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { mime: "image/png", width: v.getUint32(16), height: v.getUint32(20) };
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // SOF0–SOF15 mimo DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: "image/jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const kind = ascii(b, 12, 4);
  const mime = "image/webp" as const;
  if (kind === "VP8 ") return { mime, width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  if (kind === "VP8L") {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { mime, width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X") {
    return { mime, width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1 };
  }
  return null;
}

/** Formát a rozměry obrázku, nebo null, pokud to není JPEG, PNG ani WebP. */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const info = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  if (!info || !(info.width > 0) || !(info.height > 0)) return null;
  return info;
}
