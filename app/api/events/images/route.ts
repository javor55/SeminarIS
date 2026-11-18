import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { getCurrentUser, isImpersonating, PREVIEW_READONLY_MESSAGE } from "@/lib/session";
import { isModuleEnabled } from "@/lib/modules";
import { can } from "@/modules/registry";
import { MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, readImageInfo } from "@/modules/events/image-info";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Nahrání obrázku události (titulní obrázek, obrázky v popisu): multipart pole „file“, už zmenšené v prohlížeči.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Přihlaste se prosím.", 401);
  if (!can(user.role, "events.manage.own") || !(await isModuleEnabled("events"))) return fail("Nemáte oprávnění nahrávat obrázky.", 403);
  if (await isImpersonating()) return fail(PREVIEW_READONLY_MESSAGE, 403);

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return fail("Neplatný požadavek.", 400);
  }
  if (!(file instanceof File)) return fail("Chybí soubor.", 400);
  if (file.size > MAX_IMAGE_BYTES) return fail("Obrázek je příliš velký (po zmenšení nejvýše 600 kB).", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Typ se určuje podle obsahu, deklarovanému `Content-Type` se nevěří
  const info = readImageInfo(bytes);
  if (!info) return fail("Soubor není obrázek (povolené jsou JPEG, PNG a WebP).", 415);
  if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) return fail(`Obrázek má příliš velké rozměry (nejvýše ${MAX_IMAGE_SIDE} px).`, 413);

  const image = await prisma.$transaction(async (tx) => {
    const created = await tx.eventImage.create({
      data: { data: Buffer.from(bytes), mime: info.mime, width: info.width, height: info.height, size: bytes.length, createdById: user.id },
      select: { id: true },
    });
    await audit(tx, user, {
      action: "events.image.upload",
      entityType: "event-image",
      entityId: created.id,
      summary: `Nahrán obrázek události (${info.mime.replace("image/", "")}, ${info.width}×${info.height}, ${Math.round(bytes.length / 1024)} kB)`,
    });
    return created;
  });
  return NextResponse.json({ id: image.id, url: `/api/events/images/${image.id}` });
}
