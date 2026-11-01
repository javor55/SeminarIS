"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { safeAction } from "@/lib/safe-action";
import { requirePermission } from "@/lib/session";
import { formatDateTime } from "@/lib/datetime";
import { ROLE_LABELS } from "@/lib/school";
import { previewBulkAction, resolveSelection, runBulkAction } from "@/modules/core/bulk-runner";
import type { BulkPreviewResult, BulkRunOutcome, BulkSelection } from "@/modules/core/bulk-runner-types";
import { prisma } from "@/lib/prisma";
import { studyStatusLabel } from "@/lib/school";
import { compareNames } from "@/lib/names";

// Server actions seznamu uživatelů: náhled a spuštění hromadné akce, export CSV výběru.

/** Náhled dopadu akce (jen čtení, proto bez safeAction): kolik uživatelů, koho se týká, co se stane. */
export async function previewBulk(
  actionId: string,
  selection: BulkSelection,
  params: Record<string, string>
): Promise<ActionResult<BulkPreviewResult>> {
  try {
    const actor = await requirePermission("core.users.view");
    return { ok: true, data: await previewBulkAction(actor, actionId, selection, params) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Náhled se nepodařil." };
  }
}

/** Provede hromadnou akci. Oprávnění akce kontroluje runner (akce, kterou uživatel nesmí, mu není k dispozici). */
export async function runBulk(
  actionId: string,
  selection: BulkSelection,
  params: Record<string, string>,
  expected: { selected: number; eligible: number }
) {
  return safeAction<BulkRunOutcome>(async () => {
    const actor = await requirePermission("core.users.view");
    const outcome = await runBulkAction(actor, actionId, selection, params, expected);
    revalidatePath("/users");
    revalidatePath("/", "layout");
    return outcome;
  });
}

/** CSV neprohlíží formule (=, +, -, @ na začátku buňky se v Excelu spouští jako vzorec). */
function csvCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Export vybraných uživatelů (nebo všech odpovídajících filtru) do CSV; výběr vyhodnocuje server. */
export async function exportUsersCsv(selection: BulkSelection): Promise<ActionResult<{ filename: string; csv: string; count: number }>> {
  try {
    await requirePermission("core.users.view");
    const ids = await resolveSelection(selection);
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      include: { classGroup: true },
    });
    users.sort(compareNames);
    const header = ["Jméno", "Příjmení", "E-mail", "Role", "Třída", "Stav studia", "Aktivní", "Registrace", "Poslední přihlášení"];
    const rows = users.map((u) => [
      u.firstName,
      u.lastName,
      u.email,
      ROLE_LABELS[u.role] ?? u.role,
      u.classGroup ? `${u.classGroup.grade}.${u.classGroup.letter}` : "",
      (u.role === "STUDENT" ? studyStatusLabel(u.studyStatus, u.studyEndReason) : null) ?? (u.role === "STUDENT" ? "studuje" : ""),
      u.isActive ? "ANO" : "NE",
      formatDateTime(u.createdAt),
      u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "nikdy",
    ]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
    return { ok: true, data: { filename: `uzivatele_${new Date().toISOString().slice(0, 10)}.csv`, csv, count: users.length } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Export se nepodařil." };
  }
}
