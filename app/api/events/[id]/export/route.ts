import { audit } from "@/lib/audit";
import { isImpersonating } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildRegistrationsCsv } from "@/modules/events/organizer-core";
import { loadRegistrations } from "@/modules/events/registrations-data";
import { PRIVATE_HEADERS, managedEventOrNull, notFoundResponse } from "@/modules/events/organizer-route";

export const dynamic = "force-dynamic";

// Export registrací do CSV (všechna pole formuláře včetně vlastních, termíny, stav, čas registrace). Jen pro organizátora.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await managedEventOrNull(id);
  if (!found) return notFoundResponse();
  const data = await loadRegistrations(found.user, id);
  if (!data) return notFoundResponse();
  const csv = buildRegistrationsCsv(data.fields, data.rows);
  // Export osobních údajů se zapisuje do historie (v režimu „zobrazit jako“ se nic nezapisuje)
  if (!(await isImpersonating())) {
    await prisma.$transaction((tx) =>
      audit(tx, found.user, { action: "events.registrations.export", entityType: "event", entityId: id, summary: `Událost „${found.event.title}“: export registrací do CSV (${data.rows.length})` })
    );
  }
  return new Response(csv, {
    headers: { ...PRIVATE_HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="registrace-${found.event.slug}.csv"` },
  });
}
