import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Veřejné vydání obrázku události (viditelný je na veřejné stránce události). Obrázek se nikdy nemění
// (nový se nahraje pod novým id), proto dlouhá cache.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await prisma.eventImage.findUnique({ where: { id }, select: { data: true, mime: true, size: true } });
  if (!image) return new Response("Obrázek neexistuje.", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
