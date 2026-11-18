import { appUrl } from "@/lib/email";
import { isModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { buildIcs } from "@/modules/events/ics";
import { TOKEN_RE, hashToken } from "@/modules/events/registration-core";

// Kalendář registrace (.ics) pro přidání do kalendáře. Token je v adrese, proto se nikdy nekešuje a nic se neloguje.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_req: Request, { params }: { params: { slug: string; token: string } }) {
  const { slug, token } = params;
  const notFound = () => new Response("Nenalezeno", { status: 404, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  if (!(await isModuleEnabled("events")) || !TOKEN_RE.test(token)) return notFound();

  const reg = await prisma.eventRegistration.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { event: { select: { id: true, slug: true, title: true, place: true, status: true } }, items: { include: { item: true } } },
  });
  if (!reg || reg.event.slug !== slug || reg.event.status === "DRAFT" || reg.status === "CANCELLED") return notFound();
  const items = reg.items.map((r) => r.item).filter((i) => i.startsAt && !i.cancelledAt);
  if (items.length === 0) return notFound();

  const body = buildIcs({ id: reg.event.id, title: reg.event.title, place: reg.event.place, url: appUrl(`/akce/${reg.event.slug}`) }, items);
  return new Response(body, {
    headers: { ...NO_STORE, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="registrace-${reg.code}.ics"` },
  });
}
