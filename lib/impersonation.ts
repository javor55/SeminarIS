import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { classLabel } from "@/lib/school";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_SECONDS,
  signImpersonation,
  verifyImpersonation,
  type ImpersonationPayload,
} from "@/lib/impersonation-token";
import type { Role, User } from "@/lib/types";
import { formatName } from "@/lib/names";

// „Zobrazit jako uživatel“ (jen pro čtení). Server (session callback v lib/auth.ts) zamění
// přihlášeného admina za cílového uživatele jen tehdy, když
//   1. cookie má platný podpis (HMAC s NEXTAUTH_SECRET) a neuplynula hodina,
//   2. cookie patří právě přihlášenému adminovi (a === id z JWT),
//   3. přihlášený je v DB stále aktivní ADMIN (role a aktivita se načítají při každém požadavku),
//   4. cílový uživatel existuje, je aktivní a není admin.
// Jinak se cookie ignoruje a nic se nemění.

/** Přečte a ověří podpis cookie; nic dalšího netvrdí. Mimo požadavek (cron) vrací null. */
export async function readImpersonationCookie(): Promise<ImpersonationPayload | null> {
  try {
    const raw = cookies().get(IMPERSONATION_COOKIE)?.value;
    return await verifyImpersonation(raw, process.env.NEXTAUTH_SECRET);
  } catch {
    return null;
  }
}

export type ImpersonatedUser = Pick<User, "id" | "firstName" | "lastName" | "email" | "role" | "isActive" | "classLabel"> & {
  impersonatedBy: { id: string; name: string };
};

/**
 * Pro právě přihlášeného (skutečného) uživatele z JWT vrátí zobrazovaného uživatele,
 * nebo null. `real.role` / `real.isActive` musí být čerstvé z DB (to zajišťuje jwt callback).
 */
export async function resolveImpersonation(real: {
  id: string;
  role: Role;
  isActive: boolean;
  firstName: string;
  lastName: string;
}): Promise<ImpersonatedUser | null> {
  if (real.role !== "ADMIN" || real.isActive === false) return null;
  const payload = await readImpersonationCookie();
  if (!payload || payload.a !== real.id) return null;
  if (payload.t === real.id) return null;

  const target = await prisma.user.findUnique({
    where: { id: payload.t },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, classGroup: true, studyStatus: true },
  });
  if (!target || !target.isActive || target.role === "ADMIN") return null;

  return {
    id: target.id,
    firstName: target.firstName,
    lastName: target.lastName,
    email: target.email,
    role: target.role,
    isActive: target.isActive,
    classLabel: target.role === "STUDENT" && target.classGroup ? classLabel(target.classGroup) : null,
    impersonatedBy: { id: real.id, name: formatName(real, "text") },
  };
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && !(process.env.NEXTAUTH_URL ?? "").startsWith("http://"),
  path: "/",
};

/** Nastaví cookie náhledu (volat jen ze server action po všech kontrolách). */
export async function setImpersonationCookie(adminId: string, target: { id: string; role: Role }) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Chybí NEXTAUTH_SECRET.");
  const exp = Math.floor(Date.now() / 1000) + IMPERSONATION_TTL_SECONDS;
  const token = await signImpersonation({ a: adminId, t: target.id, r: target.role, exp }, secret);
  cookies().set(IMPERSONATION_COOKIE, token, { ...cookieOptions, maxAge: IMPERSONATION_TTL_SECONDS });
}

export function clearImpersonationCookie() {
  cookies().set(IMPERSONATION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
