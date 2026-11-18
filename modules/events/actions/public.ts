"use server";

import { loadEventTextDefaults } from "@/modules/events/text-defaults";
import { headers } from "next/headers";
import { checkRateLimit, checkSubmission } from "@/lib/antibot";
import { audit, PUBLIC_ACTOR } from "@/lib/audit";
import { sendEventEmail, appUrl } from "@/lib/email";
import { isModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/safe-action";
import { serializable } from "@/lib/serializable";
import { getCurrentUser } from "@/lib/session";
import type { AudienceEntry } from "@/modules/core/audience";
import { canUserRegister } from "@/modules/events/audience-roles";
import { effectiveFields, validateAnswers } from "@/modules/events/form";
import { itemFullLabel } from "@/modules/events/format";
import { loadStudentAudienceInfo, loadTakenByItem, mergeFields } from "@/modules/events/public-data";
import { registrationPhase } from "@/modules/events/public-state";
import {
  IP_LIMIT,
  IP_WINDOW_SECONDS,
  answersToStore,
  capacityError,
  checkSelectedItems,
  clientIp,
  consentError,
  generateCode,
  generateToken,
  hashIp,
  hashToken,
} from "@/modules/events/registration-core";

// Veřejná serverová akce: registrace účastníka na událost. Bez requirePermission (účastník nemá účet); ochranu dělá antibot,
// limity, serverová validace a kapacita v serializable transakci.

export type RegisterInput = {
  /** Vybrané termíny */
  itemIds: string[];
  /** Hodnoty formuláře podle klíče pole (`email`, `name`, `custom_1`…) */
  values: Record<string, unknown>;
  consent: boolean;
  /** Řešení výzvy proti robotům (pole `altcha`) */
  solution: string | null;
  /** Honeypot (pole `website`); vyplněné = robot */
  website: string;
  /** Podepsaný čas zobrazení formuláře */
  renderToken: string;
};

const ANTIBOT_MESSAGE: Record<string, string> = {
  missing: "Formulář je neplatný nebo vypršel. Načtěte prosím stránku znovu.",
  forged: "Formulář je neplatný nebo vypršel. Načtěte prosím stránku znovu.",
  too_fast: "Formulář byl odeslán příliš rychle. Zkuste to prosím za chvíli znovu.",
};
const ANTIBOT_DEFAULT = "Ověření, že nejste robot, se nezdařilo. Zkuste to prosím znovu.";

const NOT_FOUND = "Událost neexistuje.";

export async function registerForEvent(slug: string, input: RegisterInput) {
  return safeAction(async () => {
    if (typeof slug !== "string" || !input || typeof input !== "object" || typeof input.values !== "object" || !input.values) throw new Error("Neplatný formulář.");
    if (!(await isModuleEnabled("events"))) throw new Error(NOT_FOUND);

    // 1. Ochrana proti robotům: honeypot (falešný úspěch bez zápisu), minimální doba a výzva
    const bot = await checkSubmission({ solution: input.solution, honeypot: input.website, renderToken: input.renderToken });
    if (!bot.ok) {
      const reason = (bot as { reason: string }).reason;
      if (reason === "honeypot") return { token: generateToken() };
      throw new Error(ANTIBOT_MESSAGE[reason] ?? ANTIBOT_DEFAULT);
    }

    // 2. Událost, období a oprávnění (viditelnost „jen pro přihlášené“ se ověřuje tady, ne podle klienta)
    const event = await prisma.event.findUnique({ where: { slug }, include: { audience: true, fields: true } });
    if (!event || event.status === "DRAFT") throw new Error(event ? "Událost ještě není zveřejněná." : NOT_FOUND);
    const phase = registrationPhase(event);
    if (phase === "NOT_OPEN") throw new Error("Registrace se ještě neotevřela.");
    if (phase !== "OPEN") throw new Error("Registrace skončila.");

    const user = await getCurrentUser();
    if (event.visibility === "USERS") {
      if (!user) throw new Error("Registrace je jen pro přihlášené.");
      const student = await loadStudentAudienceInfo(user);
      if (!canUserRegister({ visibility: event.visibility, audienceRoles: event.audienceRoles, audience: event.audience as AudienceEntry[] }, user, student)) {
        throw new Error("Tato událost pro vás není určena.");
      }
    }

    // 3. Souhlas a odpovědi (souhlas je povinný i na serveru)
    const consent = consentError(input.consent);
    if (consent) throw new Error(consent);
    const result = validateAnswers(effectiveFields(mergeFields(event.fields), event.allowGuests), input.values, { maxGuests: event.allowGuests ? event.maxGuests : 0 });
    if (!result.ok) throw new Error(Object.values(result.errors)[0] ?? "Formulář není správně vyplněný.");
    const email = String(result.values.email);
    const name = typeof result.values.name === "string" && result.values.name ? result.values.name : null;
    const guests = event.allowGuests ? Number(result.values.guests || 0) : 0;

    // 4. Limit registrací z jedné IP adresy (v databázi jen hash)
    const h = headers();
    const limit = await checkRateLimit(`reg:ip:${hashIp(clientIp((n) => h.get(n)))}`, IP_LIMIT, IP_WINDOW_SECONDS);
    if (!limit.allowed) throw new Error("Z vaší adresy proběhlo příliš mnoho registrací. Zkuste to prosím později.");

    // 5. Stav, počet termínů, limit na e-mail, kapacita (včetně doprovodu) a zápis v jedné serializable transakci
    const token = generateToken();
    const created = await serializable(async (tx) => {
      const ev = await tx.event.findUnique({ where: { id: event.id }, include: { items: { orderBy: [{ order: "asc" }, { startsAt: "asc" }] } } });
      if (!ev) throw new Error(NOT_FOUND);
      const current = registrationPhase(ev);
      if (current !== "OPEN") throw new Error(current === "NOT_OPEN" ? "Registrace se ještě neotevřela." : "Registrace skončila.");

      const chosen = checkSelectedItems(input.itemIds, ev.items, ev.maxItemsPerRegistration);
      if (!chosen.ok) throw new Error((chosen as { error: string }).error);
      const itemIds = (chosen as { ids: string[] }).ids;

      const sameEmail = await tx.eventRegistration.count({ where: { eventId: ev.id, email: { equals: email, mode: "insensitive" }, status: { not: "CANCELLED" } } });
      if (sameEmail >= Math.max(1, ev.maxRegistrationsPerEmail)) {
        throw new Error(
          ev.maxRegistrationsPerEmail <= 1
            ? "Na tento e-mail už na událost registrace existuje. Najdete ji v potvrzení, které jste dostali (odkaz nebo kód)."
            : `Na tento e-mail už je na událost nejvyšší povolený počet registrací (${ev.maxRegistrationsPerEmail}).`
        );
      }

      // Obsazenost se počítá znovu uvnitř transakce; souběžná registrace na poslední místo se tak nepřidělí dvakrát
      const full = capacityError(itemIds, ev.items, await loadTakenByItem(ev.id, tx), guests);
      if (full) throw new Error(full);

      let code = generateCode();
      for (let i = 0; i < 20 && (await tx.eventRegistration.findFirst({ where: { eventId: ev.id, code }, select: { id: true } })); i++) code = generateCode();

      const registration = await tx.eventRegistration.create({
        data: {
          eventId: ev.id,
          email,
          name,
          guests,
          answers: answersToStore(result.values),
          status: "CONFIRMED",
          tokenHash: hashToken(token),
          code,
          consentAt: new Date(),
          userId: user?.id ?? null,
          items: { create: itemIds.map((itemId) => ({ itemId })) },
        },
      });
      // Bez osobních údajů (jméno, e-mail): historie přežije smazání údajů účastníků
      await audit(tx, user ?? PUBLIC_ACTOR, {
        action: "events.registration.create",
        entityType: "event",
        entityId: ev.id,
        summary: `Událost „${ev.title}“: nová registrace ${code} (termínů: ${itemIds.length}, osob: ${1 + guests})`,
        data: { registrationId: registration.id, itemIds: itemIds },
      });
      return { registration, event: ev, items: ev.items.filter((i) => itemIds.includes(i.id)) };
    });

    // 6. Potvrzovací e-mail až po commitu. Když neodejde (limit, vypnuto, chyba), registrace platí a odkaz s kódem je na obrazovce.
    if (created.event.confirmChannel !== "SCREEN_ONLY") {
      const sent = await sendEventEmail("events.registration.confirmed", [
        {
          email,
          userId: user?.id ?? null,
          vars: {
            jmeno: name ?? email,
            akce: created.event.title,
            terminy: created.items.map((i) => `• ${itemFullLabel(i)}`).join("\n"),
            odkaz: appUrl(`/akce/${created.event.slug}/r/${token}`),
            kod: created.registration.code,
            misto: created.event.place ?? "—",
            text: created.event.confirmationText?.trim() || (await loadEventTextDefaults()).confirmationText,
          },
        },
      ]);
      if (sent.sent < 1) {
        await prisma.eventRegistration.update({ where: { id: created.registration.id }, data: { confirmEmailFailed: true } }).catch(() => undefined);
      }
    }
    return { token };
  });
}
