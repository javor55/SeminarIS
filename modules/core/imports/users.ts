import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { Role } from "@prisma/client";
import type { TxClient } from "@/lib/prisma";
import { readTable } from "@/lib/csv";
import { DEFAULT_STUDY_YEARS, ROLE_LABELS, classLabel, parseClassLabel } from "@/lib/school";
import { ensureCurrentSchoolYear, findOrCreateClass, setStudentClass } from "@/modules/core/school";
import { countRows, type ImportPlan, type ImportPreviewRow } from "./types";

// Import uživatelů. Klíč = e-mail (bez ohledu na velikost písmen). Hesla stávajících uživatelů
// se nikdy nemění; novému uživateli se nastaví heslo ze sloupce `password`, jinak náhodné
// (přihlásí se přes Microsoft 365 nebo po resetu hesla).

export type UsersImportOptions = { update: boolean };

const FIELDS = {
  email: ["email", "emailovaadresa", "mail", "eadresa"],
  firstName: ["firstname", "jmeno", "krestnijmeno"],
  lastName: ["lastname", "prijmeni"],
  class: ["class", "trida"],
  role: ["role"],
  isActive: ["isactive", "aktivni", "active"],
  password: ["password", "heslo"],
};
const LABELS = { email: "email (e-mail)", firstName: "firstName (jméno)", lastName: "lastName (příjmení)", class: "class (třída)", role: "role", isActive: "isActive (aktivní)", password: "password (heslo)" };

const ROLE_ALIASES: Record<string, Role> = {
  guest: "GUEST", host: "GUEST",
  student: "STUDENT", zak: "STUDENT",
  teacher: "TEACHER", ucitel: "TEACHER",
  admin: "ADMIN", administrator: "ADMIN",
};

function parseRole(text: string): Role | null {
  const key = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return ROLE_ALIASES[key] ?? null;
}

function parseBool(text: string): boolean | null {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (["true", "1", "ano", "yes", "y", "a"].includes(t)) return true;
  if (["false", "0", "ne", "no", "n"].includes(t)) return false;
  return null;
}

type Op =
  | { kind: "create"; email: string; firstName: string; lastName: string; role: Role; isActive: boolean; password: string; cls: { grade: number; letter: string } | null }
  | { kind: "update"; id: string; patch: { firstName?: string; lastName?: string; role?: Role; isActive?: boolean }; cls: { grade: number; letter: string } | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function planUsersImport(
  db: TxClient,
  content: string,
  options: UsersImportOptions,
  actor: { id: string }
): Promise<ImportPlan> {
  const table = readTable(content, FIELDS, ["email"], LABELS);
  if (table.fileError) return { rows: [], fileError: table.fileError, apply: async () => ({}) };

  const emails = table.rows.map((r) => r.v.email.trim().toLowerCase()).filter(Boolean);
  const [existingUsers, classes] = await Promise.all([
    db.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, include: { classGroup: true } }),
    db.classGroup.findMany(),
  ]);
  const byEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
  const classKeys = new Set(classes.map((c) => `${c.grade}${c.letter}`));

  const rows: ImportPreviewRow[] = [];
  const ops = new Map<number, Op>();
  const seen = new Map<string, number>();

  for (const { line, v } of table.rows) {
    const email = v.email.trim().toLowerCase();
    const name = `${v.firstName} ${v.lastName}`.trim();
    const title = `${name ? `${name} ` : ""}<${email || "bez e-mailu"}>`;
    const fail = (error: string) => rows.push({ line, status: "error", title, changes: [], error });

    if (!email) { fail("chybí e-mail"); continue; }
    if (!EMAIL_RE.test(email)) { fail(`neplatný e-mail „${email}“`); continue; }
    if (seen.has(email)) { fail(`e-mail je v souboru už na řádku ${seen.get(email)}`); continue; }
    seen.set(email, line);

    let role: Role | null = null;
    if (v.role.trim()) {
      role = parseRole(v.role);
      if (!role) { fail(`neplatná role „${v.role}“ (student, učitel, admin, host)`); continue; }
    }
    let isActive: boolean | null = null;
    if (v.isActive.trim()) {
      isActive = parseBool(v.isActive);
      if (isActive === null) { fail(`neplatná hodnota aktivity „${v.isActive}“ (ano/ne)`); continue; }
    }
    let cls: { grade: number; letter: string } | null = null;
    if (v.class.trim()) {
      cls = parseClassLabel(v.class);
      if (!cls || cls.grade > DEFAULT_STUDY_YEARS) { fail(`neplatná třída „${v.class}“, očekává se např. 3.A`); continue; }
    }
    const classNew = cls && !classKeys.has(`${cls.grade}${cls.letter}`) ? " (třída se založí)" : "";
    const clsText = cls ? `${cls.grade}.${cls.letter}` : "";

    const existing = byEmail.get(email);
    if (!existing) {
      const finalRole = role ?? "STUDENT";
      if (!v.firstName.trim() && !v.lastName.trim()) { fail("chybí jméno a příjmení"); continue; }
      if (cls && finalRole !== "STUDENT") { fail("třídu lze zadat jen studentovi"); continue; }
      ops.set(line, {
        kind: "create", email, firstName: v.firstName.trim(), lastName: v.lastName.trim(),
        role: finalRole, isActive: isActive ?? true, password: v.password, cls,
      });
      rows.push({
        line, status: "new", title,
        changes: [`role: ${ROLE_LABELS[finalRole]}`, ...(cls ? [`třída: ${clsText}${classNew}`] : []), v.password ? "heslo ze souboru" : "náhodné heslo"],
      });
      continue;
    }

    if (!options.update) {
      rows.push({ line, status: "unchanged", title, changes: ["uživatel už existuje, aktualizace je vypnutá"] });
      continue;
    }
    const patch: { firstName?: string; lastName?: string; role?: Role; isActive?: boolean } = {};
    const changes: string[] = [];
    if (v.firstName.trim() && v.firstName.trim() !== existing.firstName) {
      patch.firstName = v.firstName.trim();
      changes.push(`jméno: ${existing.firstName || "—"} → ${patch.firstName}`);
    }
    if (v.lastName.trim() && v.lastName.trim() !== existing.lastName) {
      patch.lastName = v.lastName.trim();
      changes.push(`příjmení: ${existing.lastName || "—"} → ${patch.lastName}`);
    }
    if (role && role !== existing.role) {
      patch.role = role;
      changes.push(`role: ${ROLE_LABELS[existing.role]} → ${ROLE_LABELS[role]}`);
    }
    if (isActive !== null && isActive !== existing.isActive) {
      patch.isActive = isActive;
      changes.push(`aktivní: ${existing.isActive ? "ano" : "ne"} → ${isActive ? "ano" : "ne"}`);
    }
    const finalRole = patch.role ?? existing.role;
    if (cls && finalRole !== "STUDENT") { fail("třídu lze zadat jen studentovi"); continue; }
    const classChanged = !!cls && (existing.classGroup?.grade !== cls.grade || existing.classGroup?.letter !== cls.letter);
    if (cls && classChanged) {
      changes.push(`třída: ${existing.classGroup ? classLabel(existing.classGroup) : "bez třídy"} → ${clsText}${classNew}`);
    }
    if (existing.id === actor.id && (patch.role || patch.isActive === false)) {
      fail("nelze měnit vlastní roli ani deaktivovat vlastní účet");
      continue;
    }
    if (changes.length === 0) {
      rows.push({ line, status: "unchanged", title, changes: [] });
      continue;
    }
    ops.set(line, { kind: "update", id: existing.id, patch, cls: classChanged ? cls : null });
    rows.push({ line, status: "change", title, changes });
  }

  return {
    rows,
    apply: async (tx) => {
      const schoolYear = await ensureCurrentSchoolYear();
      const userIds: string[] = [];
      for (const op of ops.values()) {
        let userId: string;
        if (op.kind === "create") {
          // náhodné heslo nikdo nezná, proto stačí levné hashování; zadané heslo se hashuje plně
          const passwordHash = op.password
            ? await bcrypt.hash(op.password, 10)
            : await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 4);
          const created = await tx.user.create({
            data: { email: op.email, firstName: op.firstName, lastName: op.lastName, role: op.role, isActive: op.isActive, passwordHash },
          });
          userId = created.id;
        } else {
          userId = op.id;
          if (Object.keys(op.patch).length > 0) {
            await tx.user.update({
              where: { id: op.id },
              // žádost o třídu má smysl jen u hosta čekajícího na schválení
              data: { ...op.patch, ...(op.patch.role && op.patch.role !== "GUEST" ? { requestedClassGroupId: null } : {}) },
            });
          }
        }
        if (op.cls) {
          const group = await findOrCreateClass(op.cls.grade, op.cls.letter, tx);
          await setStudentClass(tx, { userId, classGroupId: group.id, schoolYear });
        }
        userIds.push(userId);
      }
      return { userIds };
    },
  };
}

export { countRows };
