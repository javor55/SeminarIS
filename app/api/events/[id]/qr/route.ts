import QRCode from "qrcode";
import { appUrl } from "@/lib/email";
import { PRIVATE_HEADERS, managedEventOrNull, notFoundResponse } from "@/modules/events/organizer-route";

export const dynamic = "force-dynamic";

// QR kód veřejného odkazu události (/akce/<slug>) pro plakát: PNG nebo SVG, generuje se na serveru.
// Jen pro toho, kdo událost spravuje. `?format=png|svg` (výchozí png), `?download=1` stáhne soubor.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await managedEventOrNull(id);
  if (!found) return notFoundResponse();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const link = appUrl(`/akce/${found.event.slug}`);
  const disposition = url.searchParams.get("download") === "1" ? { "Content-Disposition": `attachment; filename="qr-${found.event.slug}.${format}"` } : {};
  if (format === "svg") {
    const svg = await QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
    return new Response(svg, { headers: { ...PRIVATE_HEADERS, ...disposition, "Content-Type": "image/svg+xml; charset=utf-8" } });
  }
  const png = await QRCode.toBuffer(link, { type: "png", width: 1024, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), { headers: { ...PRIVATE_HEADERS, ...disposition, "Content-Type": "image/png" } });
}
