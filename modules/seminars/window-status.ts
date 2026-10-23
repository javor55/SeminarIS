import { prisma } from "@/lib/prisma";
import { computeEnrollmentStatus } from "@/lib/utils";
import { notifyWindowOpened } from "@/modules/seminars/notifications";

// === Synchronizace stavu zápisového okna s časem ===
export async function syncEnrollmentWindowStatus(ew: { id: string; status: string; startsAt: string | Date; endsAt: string | Date }) {
  const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
  let newDbStatus: string | null = null;

  if (computed.is === "open" && ew.status !== "OPEN") {
    newDbStatus = "OPEN";
  } else if (computed.is === "closed" && ew.status !== "DRAFT" && ew.status !== "CLOSED") {
    newDbStatus = "CLOSED";
  }

  if (newDbStatus) {
    await prisma.enrollmentWindow.update({
      where: { id: ew.id },
      data: { status: newDbStatus as "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED" },
    });
    // Okno se právě otevřelo: upozornit studenty (jednou za okno; v náhledu „zobrazit jako“ se nic neděje)
    if (newDbStatus === "OPEN") await notifyWindowOpened(ew.id);
    return newDbStatus;
  }
  return ew.status;
}
