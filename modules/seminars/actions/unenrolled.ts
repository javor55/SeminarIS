"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/session";
import { computeUnenrolled, missingBlockLabel, sendUnenrolledReminder } from "@/modules/seminars/unenrolled";

// Nezapsaní studenti zápisového okna (záložka „Nezapsaní“ v detailu okna).

export type UnenrolledView = {
  windowName: string;
  blockCount: number;
  students: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    classGroupId: string | null;
    classLabel: string | null;
    missingBlocks: string[];
  }[];
  // Třídy, ve kterých jsou nezapsaní (pro filtr)
  classes: { id: string; label: string }[];
};

export async function getUnenrolledView(windowId: string): Promise<UnenrolledView> {
  await requirePermission("seminars.windows.view");
  const o = await computeUnenrolled(windowId);
  if (!o) throw new Error("Zápisové okno nenalezeno.");
  const classes = new Map<string, string>();
  for (const s of o.students) if (s.classGroupId && s.classLabel) classes.set(s.classGroupId, s.classLabel);
  return {
    windowName: o.windowName,
    blockCount: o.blockCount,
    students: o.students.map((s) => ({ ...s, missingBlocks: s.missingBlocks.map((b) => missingBlockLabel(b)) })),
    classes: [...classes.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "cs", { numeric: true })),
  };
}

/** Ručně pošle připomínku všem nezapsaným (tlačítko s potvrzením). */
export async function remindUnenrolled(windowId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const res = await sendUnenrolledReminder(windowId, { manual: true });
    if (!res) throw new Error("Zápisové okno nenalezeno.");
    const ew = await prisma.enrollmentWindow.findUnique({ where: { id: windowId }, select: { name: true } });
    await audit(prisma, admin, {
      action: "seminars.window.remind",
      entityType: "enrollmentWindow",
      entityId: windowId,
      summary: `Ruční připomínka nezapsaným v zápisu „${ew?.name}“: odesláno ${res.sent} z ${res.total} e-mailů` +
        (res.skippedLimit ? `, ${res.skippedLimit} přeskočeno kvůli limitu` : "") +
        (res.skippedDisabled ? `, ${res.skippedDisabled} přeskočeno (vypnuto nebo odhlášeno z upozornění)` : "") +
        (res.failed ? `, ${res.failed} se nepodařilo odeslat` : ""),
      data: { total: res.total, sent: res.sent, failed: res.failed, skippedLimit: res.skippedLimit, skippedDisabled: res.skippedDisabled },
    });
    return { total: res.total, sent: res.sent, failed: res.failed, skippedLimit: res.skippedLimit, skippedDisabled: res.skippedDisabled, error: res.firstError };
  });
}
