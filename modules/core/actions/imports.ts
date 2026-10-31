"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { prisma, type TxClient } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { stripBom } from "@/lib/csv";
import type { Permission } from "@/modules/registry";
import type { User } from "@/lib/types";
import { countRows, type ImportPlan, type ImportPreview, type ImportResult } from "@/modules/core/imports/types";
import { planUsersImport, type UsersImportOptions } from "@/modules/core/imports/users";
import { planAssignmentsImport } from "@/modules/core/imports/assignments";
import { planSubjectsImport, type SubjectsImportOptions } from "@/modules/core/imports/subjects";

// Importy s náhledem ve dvou krocích. Náhled (`preview…`) jen čte. Potvrzení (`confirm…`)
// nevěří náhledu z klienta: znovu načte stejný obsah souboru, znovu ho zvaliduje v transakci,
// zapíše jen platné řádky a vše zaznamená jedním záznamem do historie.

const MAX_CONTENT = 2_000_000;

type Kind = {
  permission: Permission;
  title: string;
  action: string;
  entityType: string;
  plan: (_db: TxClient, _content: string, _options: never, _actor: User) => Promise<ImportPlan>;
};

function checkContent(content: unknown): string {
  if (typeof content !== "string" || !content.trim()) throw new Error("Soubor je prázdný.");
  if (content.length > MAX_CONTENT) throw new Error("Soubor je příliš velký (nejvýš 2 MB).");
  return stripBom(content);
}

async function preview(kind: Kind, content: string, options: unknown): Promise<ImportPreview> {
  const actor = await requirePermission(kind.permission);
  const plan = await kind.plan(prisma, checkContent(content), options as never, actor);
  return { rows: plan.rows, counts: countRows(plan.rows), fileError: plan.fileError };
}

async function confirm(kind: Kind, content: string, options: unknown): Promise<ImportResult> {
  const actor = await requirePermission(kind.permission);
  const text = checkContent(content);
  const result = await prisma.$transaction(
    async (tx) => {
      const plan = await kind.plan(tx, text, options as never, actor);
      if (plan.fileError) throw new Error(plan.fileError);
      const counts = countRows(plan.rows);
      if (counts.new + counts.change === 0) throw new Error("Není co importovat: žádný řádek není nový ani změněný.");
      const extra = await plan.apply(tx);
      const summary = `${kind.title}: ${counts.new} nových, ${counts.change} změněných, ${counts.unchanged} beze změny, ${counts.error} chyb (řádků celkem ${plan.rows.length})`;
      await audit(tx, actor, {
        action: kind.action,
        entityType: kind.entityType,
        summary,
        data: { ...counts, rows: plan.rows.length, options: (options ?? {}) as Record<string, boolean>, ...(extra as Record<string, string | number | string[]>) },
      });
      return { counts, summary } satisfies ImportResult;
    },
    { timeout: 120_000, maxWait: 20_000 }
  );
  revalidatePath("/", "layout");
  return result;
}

const USERS: Kind = {
  permission: "core.users.manage",
  title: "Import uživatelů",
  action: "users.import",
  entityType: "user",
  plan: (db, content, options: UsersImportOptions, actor) => planUsersImport(db, content, { update: !!options?.update }, actor),
};
const ASSIGNMENTS: Kind = {
  permission: "core.school.manage",
  title: "Import úvazků",
  action: "subjects.assignment.import",
  entityType: "teachingAssignment",
  plan: (db, content) => planAssignmentsImport(db, content),
};
const SUBJECTS: Kind = {
  permission: "core.subjects.edit",
  title: "Import předmětů",
  action: "subjects.subject.import",
  entityType: "subject",
  plan: (db, content, options: SubjectsImportOptions, actor) => planSubjectsImport(db, content, { update: !!options?.update }, actor),
};

export async function previewUsersImport(content: string, options: UsersImportOptions) {
  return safeAction(() => preview(USERS, content, options));
}
export async function confirmUsersImport(content: string, options: UsersImportOptions) {
  return safeAction(() => confirm(USERS, content, options));
}
export async function previewAssignmentsImport(content: string) {
  return safeAction(() => preview(ASSIGNMENTS, content, {}));
}
export async function confirmAssignmentsImport(content: string) {
  return safeAction(() => confirm(ASSIGNMENTS, content, {}));
}
export async function previewSubjectsImport(content: string, options: SubjectsImportOptions) {
  return safeAction(() => preview(SUBJECTS, content, options));
}
export async function confirmSubjectsImport(content: string, options: SubjectsImportOptions) {
  return safeAction(() => confirm(SUBJECTS, content, options));
}
