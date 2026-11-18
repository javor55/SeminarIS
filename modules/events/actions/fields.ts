"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/safe-action";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { ensureFixedFields, fieldKeysWithAnswers } from "@/modules/events/fields-db";
import { CUSTOM_FIELDS_LIMIT, MODE_LABEL, TYPE_LABEL, cleanFieldDefinition, nextCustomKey, type FieldMode, type FieldType } from "@/modules/events/form";
import { assertEditable, loadManaged } from "@/modules/events/manage";

const MODES: FieldMode[] = ["REQUIRED", "OPTIONAL", "HIDDEN"];
const TYPES: FieldType[] = ["TEXT", "TEXTAREA", "SELECT", "CHECKBOX"];

async function loadField(tx: Parameters<typeof loadManaged>[0], eventId: string, fieldId: string) {
  const field = await tx.eventField.findUnique({ where: { id: fieldId } });
  if (!field || field.eventId !== eventId) throw new Error("Pole neexistuje.");
  return field;
}

function refresh(eventId: string) {
  revalidatePath(`/events/${eventId}`);
}

/** Přepne pevné pole mezi Povinné / Volitelné / Skryté (pole „Počet osob“ se řídí nastavením doprovodu). */
export async function setFieldMode(eventId: string, fieldId: string, mode: FieldMode) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    if (!MODES.includes(mode)) throw new Error("Neplatný režim pole.");
    await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const field = await loadField(tx, eventId, fieldId);
      if (field.key === "guests") throw new Error("Pole „Počet osob“ se řídí nastavením Doprovod u události.");
      await tx.eventField.update({ where: { id: fieldId }, data: { mode } });
      await audit(tx, user, {
        action: "events.field.mode",
        entityType: "event",
        entityId: eventId,
        summary: `Událost „${event.title}“: pole „${field.label}“ je ${MODE_LABEL[mode].toLowerCase()}`,
      });
    });
    refresh(eventId);
  });
}

export type CustomFieldInput = { type: FieldType; label: string; options: string[]; required: boolean };

export async function createField(eventId: string, input: CustomFieldInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    if (!TYPES.includes(input?.type)) throw new Error("Neplatný typ pole.");
    const def = cleanFieldDefinition(input);
    const id = await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      await ensureFixedFields(tx, eventId);
      const fields = await tx.eventField.findMany({ where: { eventId }, select: { key: true, order: true, builtin: true } });
      if (fields.filter((f) => !f.builtin).length >= CUSTOM_FIELDS_LIMIT) throw new Error(`Vlastních polí může být nejvýše ${CUSTOM_FIELDS_LIMIT}.`);
      const created = await tx.eventField.create({
        data: {
          eventId,
          key: nextCustomKey(fields.map((f) => f.key)),
          type: input.type,
          label: def.label,
          options: def.options,
          mode: input.required ? "REQUIRED" : "OPTIONAL",
          order: fields.reduce((m, f) => Math.max(m, f.order), -1) + 1,
          builtin: false,
        },
      });
      await audit(tx, user, {
        action: "events.field.create",
        entityType: "event",
        entityId: eventId,
        summary: `Událost „${event.title}“: přidáno pole „${def.label}“ (${TYPE_LABEL[input.type].toLowerCase()})`,
      });
      return created.id;
    });
    refresh(eventId);
    return { id };
  });
}

/** Upraví popisek, možnosti a povinnost vlastního pole (typ se po vytvoření nemění). */
export async function updateField(eventId: string, fieldId: string, input: Omit<CustomFieldInput, "type">) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const field = await loadField(tx, eventId, fieldId);
      if (field.builtin) throw new Error("Pevné pole jde jen přepnout mezi Povinné, Volitelné a Skryté.");
      const def = cleanFieldDefinition({ type: field.type, label: input.label, options: input.options });
      await tx.eventField.update({ where: { id: fieldId }, data: { label: def.label, options: def.options, mode: input.required ? "REQUIRED" : field.mode === "HIDDEN" ? "HIDDEN" : "OPTIONAL" } });
      await audit(tx, user, { action: "events.field.update", entityType: "event", entityId: eventId, summary: `Událost „${event.title}“: upraveno pole „${def.label}“` });
    });
    refresh(eventId);
  });
}

export async function deleteField(eventId: string, fieldId: string) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const field = await loadField(tx, eventId, fieldId);
      if (field.builtin) throw new Error("Pevné pole nejde smazat, jen skrýt.");
      if ((await fieldKeysWithAnswers(tx, eventId)).has(field.key)) throw new Error("K poli už existují odpovědi účastníků, proto ho nejde smazat. Skryjte ho, odpovědi zůstanou zachované.");
      await tx.eventField.delete({ where: { id: fieldId } });
      await audit(tx, user, { action: "events.field.delete", entityType: "event", entityId: eventId, summary: `Událost „${event.title}“: smazáno pole „${field.label}“` });
    });
    refresh(eventId);
  });
}

/** Posune pole o jedno místo nahoru nebo dolů. */
export async function moveField(eventId: string, fieldId: string, direction: "up" | "down") {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const fields = await tx.eventField.findMany({ where: { eventId }, orderBy: [{ order: "asc" }, { key: "asc" }] });
      const i = fields.findIndex((f) => f.id === fieldId);
      if (i < 0) throw new Error("Pole neexistuje.");
      const j = direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= fields.length) return;
      [fields[i], fields[j]] = [fields[j], fields[i]];
      // pořadí se přečísluje celé, aby nevznikly shodné hodnoty
      for (let k = 0; k < fields.length; k++) if (fields[k].order !== k) await tx.eventField.update({ where: { id: fields[k].id }, data: { order: k } });
      await audit(tx, user, { action: "events.field.reorder", entityType: "event", entityId: eventId, summary: `Událost „${event.title}“: změněno pořadí polí formuláře` });
    });
    refresh(eventId);
  });
}
