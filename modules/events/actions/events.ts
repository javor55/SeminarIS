"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";
import { safeAction } from "@/lib/safe-action";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { audienceKey, entriesFromDraft } from "@/modules/core/audience";
import { cleanAudienceDraft } from "@/modules/core/audience-db";
import { loadManaged } from "@/modules/events/manage";
import { cleanDuplicateInput, shiftByDays, type DuplicateInput } from "@/modules/events/duplicate-core";
import { ensureFixedFields } from "@/modules/events/fields-db";
import { cleanEventSettings, type EventSettingsInput } from "@/modules/events/settings";
import { EVENT_STATUS_LABEL, canChangeStatus, type EventStatusValue } from "@/modules/events/status";
import { randomSlug, slugify, uniqueSlug } from "@/modules/events/slug";

const SLUG_TAKEN = "Tento odkaz už používá jiná událost, zvolte jiný.";

const slugExists = (tx: TxClient, exceptId?: string) => async (slug: string) =>
  !!(await tx.event.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } }));

/** Nahradí spoluorganizátory: jen aktivní učitelé, autor mezi nimi být nemusí. */
async function replaceOrganizers(tx: TxClient, eventId: string, createdById: string, userIds: string[]) {
  const ids = userIds.filter((id) => id !== createdById);
  if (ids.length && (await tx.user.count({ where: { id: { in: ids }, role: "TEACHER", isActive: true } })) !== ids.length) {
    throw new Error("Spoluorganizátor musí být aktivní učitel.");
  }
  await tx.eventOrganizer.deleteMany({ where: { eventId } });
  if (ids.length) await tx.eventOrganizer.createMany({ data: ids.map((userId) => ({ eventId, userId })) });
}

/** Nahradí publikum (jen pro viditelnost „jen pro přihlášené“; u veřejné události se maže). */
async function replaceEventAudience(tx: TxClient, eventId: string, visibility: "PUBLIC" | "USERS", draft: Parameters<typeof cleanAudienceDraft>[1]) {
  await tx.eventAudience.deleteMany({ where: { eventId } });
  if (visibility !== "USERS") return;
  const clean = await cleanAudienceDraft(tx, draft);
  const entries = entriesFromDraft(clean);
  if (entries.length) {
    await tx.eventAudience.createMany({
      data: entries.map((e) => ({ eventId, type: e.type, grade: e.grade ?? null, classGroupId: e.classGroupId ?? null, userId: e.userId ?? null, key: audienceKey(e) })),
    });
  }
}

/** Titulní obrázek musí existovat. */
async function checkImage(tx: TxClient, imageId: string | null) {
  if (imageId && !(await tx.eventImage.findUnique({ where: { id: imageId }, select: { id: true } }))) throw new Error("Vybraný obrázek neexistuje, nahrajte ho znovu.");
}

const slugCollision = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function createEvent(input: EventSettingsInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    const data = cleanEventSettings(input);
    try {
      const created = await prisma.$transaction(async (tx) => {
        let slug: string;
        if (data.randomSlug) slug = await uniqueSlug(randomSlug(), slugExists(tx));
        else if (data.slug) {
          if (await slugExists(tx)(data.slug)) throw new Error(SLUG_TAKEN);
          slug = data.slug;
        } else slug = await uniqueSlug(slugify(data.title), slugExists(tx));

        await checkImage(tx, data.imageId);
        const event = await tx.event.create({
          data: {
            slug,
            title: data.title,
            subtitle: data.subtitle,
            place: data.place,
            contact: data.contact,
            registrationOpensAt: data.registrationOpensAt,
            registrationClosesAt: data.registrationClosesAt,
            visibility: data.visibility,
            audienceRoles: data.audienceRoles,
            maxItemsPerRegistration: data.maxItemsPerRegistration,
            allowGuests: data.allowGuests,
            maxGuests: data.maxGuests,
            changeDeadlineMinutes: data.changeDeadlineMinutes,
            maxRegistrationsPerEmail: data.maxRegistrationsPerEmail,
            waitlistEnabled: data.waitlistEnabled,
            confirmChannel: data.confirmChannel,
            confirmationText: data.confirmationText,
            consentText: data.consentText,
            imageId: data.imageId,
            imageAlt: data.imageAlt,
            descriptionHtml: data.descriptionHtml,
            createdById: user.id,
          },
        });
        await replaceOrganizers(tx, event.id, user.id, data.organizerIds);
        await replaceEventAudience(tx, event.id, data.visibility, data.audience);
        await ensureFixedFields(tx, event.id);
        await audit(tx, user, { action: "events.event.create", entityType: "event", entityId: event.id, summary: `Založena událost „${event.title}“ (/akce/${event.slug})` });
        return { id: event.id, slug: event.slug };
      });
      revalidatePath("/events", "layout");
      return created;
    } catch (e) {
      if (slugCollision(e)) throw new Error(SLUG_TAKEN);
      throw e;
    }
  });
}

const FIELD_LABELS = {
  title: "název",
  subtitle: "podtitulek",
  place: "místo",
  contact: "kontakt",
  slug: "odkaz",
  registrationOpensAt: "začátek registrace",
  registrationClosesAt: "konec registrace",
  visibility: "viditelnost",
  audienceRoles: "role",
  maxItemsPerRegistration: "termínů na registraci",
  allowGuests: "doprovod",
  maxGuests: "max. osob navíc",
  changeDeadlineMinutes: "uzávěrka změn (min)",
  maxRegistrationsPerEmail: "registrací na e-mail",
  waitlistEnabled: "čekací listina",
  confirmChannel: "potvrzení registrace",
  confirmationText: "text potvrzení",
  consentText: "text souhlasu",
  imageAlt: "alternativní text obrázku",
} as const;

export async function updateEvent(id: string, input: EventSettingsInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    const data = cleanEventSettings(input);
    try {
      const result = await prisma.$transaction(async (tx) => {
        const before = await loadManaged(tx, user, id);
        await checkImage(tx, data.imageId);
        let slug = before.slug;
        if (data.randomSlug) slug = await uniqueSlug(randomSlug(), slugExists(tx, id));
        else if (data.slug && data.slug !== before.slug) {
          if (await slugExists(tx, id)(data.slug)) throw new Error(SLUG_TAKEN);
          slug = data.slug;
        }
        const after = await tx.event.update({
          where: { id },
          data: {
            slug,
            title: data.title,
            subtitle: data.subtitle,
            place: data.place,
            contact: data.contact,
            registrationOpensAt: data.registrationOpensAt,
            registrationClosesAt: data.registrationClosesAt,
            visibility: data.visibility,
            audienceRoles: data.audienceRoles,
            maxItemsPerRegistration: data.maxItemsPerRegistration,
            allowGuests: data.allowGuests,
            maxGuests: data.maxGuests,
            changeDeadlineMinutes: data.changeDeadlineMinutes,
            maxRegistrationsPerEmail: data.maxRegistrationsPerEmail,
            waitlistEnabled: data.waitlistEnabled,
            confirmChannel: data.confirmChannel,
            confirmationText: data.confirmationText,
            consentText: data.consentText,
            imageId: data.imageId,
            imageAlt: data.imageAlt,
            descriptionHtml: data.descriptionHtml,
          },
        });
        await replaceOrganizers(tx, id, before.createdById, data.organizerIds);
        await replaceEventAudience(tx, id, data.visibility, data.audience);
        const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null || v === "" ? "—" : v === true ? "ano" : v === false ? "ne" : String(v));
        const changes = (Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[])
          .filter((k) => norm(before[k]) !== norm(after[k]))
          .map((k) => `${FIELD_LABELS[k]}: ${norm(before[k])} → ${norm(after[k])}`)
          .concat(before.imageId !== after.imageId ? ["titulní obrázek změněn"] : [])
          .concat(before.descriptionHtml !== after.descriptionHtml ? ["popis změněn"] : [])
          .join("; ");
        await audit(tx, user, {
          action: "events.event.update",
          entityType: "event",
          entityId: id,
          summary: `Upravena událost „${after.title}“${changes ? `: ${changes}` : ""}`,
        });
        return { id, slug: after.slug };
      });
      revalidatePath("/events", "layout");
      return result;
    } catch (e) {
      if (slugCollision(e)) throw new Error(SLUG_TAKEN);
      throw e;
    }
  });
}

/** Změna stavu: zveřejnit, uzavřít registraci, archivovat, vrátit do konceptu. */
export async function setEventStatus(id: string, status: EventStatusValue) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    await prisma.$transaction(async (tx) => {
      const before = await loadManaged(tx, user, id);
      if (!canChangeStatus(before.status, status)) {
        throw new Error(`Ze stavu „${EVENT_STATUS_LABEL[before.status]}“ nejde přejít na „${EVENT_STATUS_LABEL[status]}“.`);
      }
      await tx.event.update({ where: { id }, data: { status, archivedAt: status === "ARCHIVED" ? new Date() : null } });
      await audit(tx, user, {
        action: "events.event.status",
        entityType: "event",
        entityId: id,
        summary: `Událost „${before.title}“: stav ${EVENT_STATUS_LABEL[before.status]} → ${EVENT_STATUS_LABEL[status]}`,
      });
    });
    revalidatePath("/events", "layout");
  });
}

/** Smazat jde jen koncept bez registrací. */
export async function deleteEvent(id: string) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, id);
      if (event.status !== "DRAFT") throw new Error("Smazat jde jen koncept. Ostatní události archivujte.");
      if ((await tx.eventRegistration.count({ where: { eventId: id } })) > 0) throw new Error("Událost už má registrace, nejde smazat. Archivujte ji.");
      await tx.event.delete({ where: { id } });
      await audit(tx, user, { action: "events.event.delete", entityType: "event", entityId: id, summary: `Smazána událost „${event.title}“` });
    });
    revalidatePath("/events", "layout");
  });
}

/** Nahradí spoluorganizátory události (jiné učitele než autora). */
export async function setOrganizers(id: string, userIds: string[]) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, id);
      await replaceOrganizers(tx, id, event.createdById, Array.isArray(userIds) ? userIds : []);
      const count = await tx.eventOrganizer.count({ where: { eventId: id } });
      await audit(tx, user, { action: "events.event.organizers", entityType: "event", entityId: id, summary: `Událost „${event.title}“: spoluorganizátorů ${count}` });
    });
    revalidatePath("/events", "layout");
  });
}

/**
 * Duplikace události: zkopíruje nastavení, formulář, titulní obrázek (odkaz na stejný `EventImage`), popis, nezrušené termíny
 * (i s obdobím registrace posunuté o `shiftDays` dní), publikum, role a spoluorganizátory. Registrace se nekopírují; nová
 * událost je koncept s novým odkazem a jejím autorem je ten, kdo duplikuje (původní autor se stane spoluorganizátorem, je-li
 * aktivní učitel). Povolená je i u archivované události.
 */
export async function duplicateEvent(id: string, input: DuplicateInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    const { title, shiftDays } = cleanDuplicateInput(input);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const src = await loadManaged(tx, user, id);
        const [items, fields, audience] = await Promise.all([
          tx.eventItem.findMany({ where: { eventId: id, cancelledAt: null }, orderBy: [{ order: "asc" }, { startsAt: "asc" }] }),
          tx.eventField.findMany({ where: { eventId: id }, orderBy: [{ order: "asc" }, { key: "asc" }] }),
          tx.eventAudience.findMany({ where: { eventId: id } }),
        ]);
        const slug = await uniqueSlug(slugify(title), slugExists(tx));
        const shift = (d: Date | null) => (d ? shiftByDays(d, shiftDays) : null);
        const event = await tx.event.create({
          data: {
            slug,
            title,
            subtitle: src.subtitle,
            place: src.place,
            contact: src.contact,
            descriptionHtml: src.descriptionHtml,
            imageId: src.imageId,
            imageAlt: src.imageAlt,
            status: "DRAFT",
            visibility: src.visibility,
            audienceRoles: src.audienceRoles,
            registrationOpensAt: shift(src.registrationOpensAt),
            registrationClosesAt: shift(src.registrationClosesAt),
            maxItemsPerRegistration: src.maxItemsPerRegistration,
            allowGuests: src.allowGuests,
            maxGuests: src.maxGuests,
            changeDeadlineMinutes: src.changeDeadlineMinutes,
            maxRegistrationsPerEmail: src.maxRegistrationsPerEmail,
            waitlistEnabled: src.waitlistEnabled,
            confirmChannel: src.confirmChannel,
            confirmationText: src.confirmationText,
            consentText: src.consentText,
            createdById: user.id,
          },
        });
        if (items.length) {
          await tx.eventItem.createMany({
            data: items.map((i) => ({ eventId: event.id, label: i.label, startsAt: shift(i.startsAt), endsAt: shift(i.endsAt), capacity: i.capacity, note: i.note, order: i.order })),
          });
        }
        if (fields.length) {
          await tx.eventField.createMany({
            data: fields.map((f) => ({ eventId: event.id, key: f.key, type: f.type, label: f.label, mode: f.mode, options: f.options, order: f.order, builtin: f.builtin })),
          });
        }
        if (audience.length) {
          await tx.eventAudience.createMany({
            data: audience.map((a) => ({ eventId: event.id, type: a.type, grade: a.grade, classGroupId: a.classGroupId, userId: a.userId, key: a.key })),
          });
        }
        // Původní spoluorganizátoři a autor (pokud nejde o toho, kdo duplikuje); jiní než aktivní učitelé se vynechají
        const wanted = [...src.organizers.map((o) => o.userId), src.createdById].filter((x) => x !== user.id);
        const teachers = wanted.length ? await tx.user.findMany({ where: { id: { in: wanted }, role: "TEACHER", isActive: true }, select: { id: true } }) : [];
        if (teachers.length) await tx.eventOrganizer.createMany({ data: teachers.map((t) => ({ eventId: event.id, userId: t.id })) });
        await ensureFixedFields(tx, event.id);
        await audit(tx, user, {
          action: "events.event.duplicate",
          entityType: "event",
          entityId: event.id,
          summary: `Událost „${src.title}“ duplikována jako „${event.title}“ (/akce/${event.slug}): termínů ${items.length}, posun ${shiftDays} dní, bez registrací, koncept`,
          data: { sourceId: id, shiftDays, items: items.length },
        });
        return { id: event.id, slug: event.slug };
      });
      revalidatePath("/events", "layout");
      return created;
    } catch (e) {
      if (slugCollision(e)) throw new Error("Odkaz nové události se právě obsadil jinou událostí, zkuste to znovu.");
      throw e;
    }
  });
}
