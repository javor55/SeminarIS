import type { Prisma } from "@prisma/client";
import type { TxClient } from "@/lib/prisma";
import { addDaysToDayKey, schoolDateTime, schoolDayKey } from "@/lib/datetime";
import type { DemoClearContext, DemoSeedContext, ModuleDemoData } from "@/modules/server-types";
import { DEMO_SHOWCASE_TEACHER_ID } from "@/modules/core/demo/constants";
import { FIXED_FIELDS } from "@/modules/events/form";
import { generateCode, hashToken, generateToken } from "@/modules/events/registration-core";
import { uniqueSlug } from "@/modules/events/slug";

// Ukázková data modulu Události (F9): „Den otevřených dveří“ s titulním obrázkem (malý WebP vložený přímo v kódu),
// osmi termíny, formulářem a 25 registracemi. E-maily účastníků jsou na `.invalid` (nic se na ně neodešle).
// Žádné e-maily se při naplnění neposílají.

/** Titulní obrázek 320×180 (WebP, ~1,3 kB), aby ukázková událost nebyla bez obrázku. */
const DEMO_IMAGE_WEBP_BASE64 = "UklGRvwEAABXRUJQVlA4IPAEAACQKQCdASpAAbQAPwF6uFUrNKwjI9EqCpAgCU3cLc8T+is3l9L/XeZ37BmsvtxnPzvvIf6H6B/OV9J3/ovnfIgfM01u/gOsmlVOlbWta1rWta1rWsbjG3686CvOgrzoK2KAAIVXu6gZ6rTWItd7SnajFbpRnCUdylHJXXgc/x6HnoN3D9Vz3tFwIf2OR6f6gChhwdYaU+K6BKDfuqguLAWXzfsC58ZLZBKhFY2WrNfoeLaiNkSijhInIL8mSQdXPl0dXFFkewyI6l9OWIMM7ZoaW3L2f+Ry7nu8coE9qKyPJWdoGAnWvQUf7kcajsyonTJJ1NWtruZCQ2nDk04Npw5NODacOTTg2nDk04Np1Vp/zI8TkRRtO1Limhuvvb0G429C3ilWqHlvPHvF5cr29Ly6vxs8NnM6AA2CUAiM91VQBEaCq09lOSSDXY9EBdLMb4Rqaw6sYAD++vpC/4H8evv/0L+ErUPchAADRn4VFiAA2KqUY/b1SeKHZDvxbXHsDNj9yIeNXpu/E1pos2Mh1EZL1Xv37i141aEs43c3DhpdycBfof1EHl8e7K3uVNFcFkE2O08Nq2OM24EJ9hoRrATX5AaZ93GTYutIAZ8skARoEN+4EkOBzFCKUhAmkxGibz3fdJrP/8tP48buFfJK9CWdGQo7yuvqR4aUaKPQflc1vSB4Mw15S7lnlw0IMJFS/WB4lGUpkH9mbtrYwOXJanop5V4wYldsu5NI9tLJMev4fGWtnSFzBa2dRzofoLzm5jRwujF18pUOAOu9XimgcGgm507+9vUqyZhUQxTMmvgHZMkIFAdl/hpuvvSnPQqiCprtb/kZUE6L/ag52IXxlUACu8zRXQ2Tu4My0J0wZVlkJmno3IdKd2/3MoKyC/KxD+i3Q95W63bpHPlgVdKYSwQlebn846LSJuYI5AE7pp5uLcgPOLIv/E/EHoM3j3v9eVJ8FQ04Y06oiq4YIzId9ZBaInz6+jdwWaGYImkJ3v9dtXFkf352J8KqQJec4ZKKGM7/3MjVRh0IykALdEujH1QmZng+SFLTKzGiUSdUCChbI5aI/gSc/7TUQbtMnFVaDUW0V7VCP1SaSMHq30KSvUL78P3JhUkKGJV4sS/5dC6pMykQ91neWB+RLvxlog5+ffjnaA2arz8KILYuRYlY93s42iCwdoyCnubF3SATCDY7phSTdqE1AgdQaE+mRmI0Sv9duDnhcd6iIdHNt0q5NX4gvCfDqgerELDUldOVqWy74MRFyScp6DWY+DNWQGYkbzCelYotDTr1U/EtXHSWBQ9dRx30rftEcNaPq7vnby8ljwisSIxExRXnmmfIewoM1ZAZiRbXLl+sUI1+rCWhqZpe1Cr1UIud5NlrCm8Esr7+jNGphylIwJ4QyPSWzeDInYPrKQ/7nxWsbAVna8uduRRzPGlpS3e3V9SQyuOOsKdAjZXO3Go7OCTdCMqZITINItZtziz4AvwqqAaDvbUwe+mAaGuDeD7O23A+0uMlc7caj4jQqcPMqV/mPd6WLo1TZPKlPt5X3KIgpA78S2fVY83bOPuSoNIROg/PxAruVmXUQh3+veO8apCYB7SLj+RFlQblBAXADy0ugDsbCGS+hidC4IIQAmH8GgPjyKyh/8I3TvNeVFCUNok4zE+e424V7iyKwZGGfnvjES4AAAAAAAAA";

const EVENT_ID = "demo-ev-01";
const IMAGE_ID = "demo-evimg-01";
const SLOTS = ["08:30", "09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30"];
const REGISTRATIONS = 25;
const CAPACITY = 8;

const FIRST = ["Jana", "Petr", "Eva", "Martin", "Lenka", "Tomáš", "Hana", "Pavel", "Alena", "Jiří", "Markéta", "David", "Lucie"];
const LAST = ["Nováková", "Svoboda", "Dvořáková", "Černý", "Procházková", "Kučera", "Veselá", "Horák", "Němcová", "Marek", "Pospíšilová", "Pokorný", "Králová"];
const SCHOOLS = ["ZŠ Komenského", "ZŠ Nová", "ZŠ Pod Lesem", "Základní škola Jiráskova", "ZŠ a MŠ Husova"];
const SOURCES = ["Web školy", "Od známých", "Sociální sítě", "Leták ve škole", "Jiné"];
const NOTES = ["Zajímá nás hlavně přírodovědné zaměření.", "Přijdeme se dvěma dětmi.", "Prosíme o možnost prohlídky laboratoří.", "Syn má zájem o informatiku."];
const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** Nejbližší pracovní den `offset` dní od dneška (víkend se posune dopředu). */
function workdayKey(now: Date, offset: number): string {
  let key = addDaysToDayKey(schoolDayKey(now), offset);
  while ([0, 6].includes(new Date(key).getUTCDay())) key = addDaysToDayKey(key, 1);
  return key;
}

export const eventsDemoData: ModuleDemoData = {
  labels: {
    Event: "Události",
    EventImage: "Obrázky událostí",
    EventRegistration: "Registrace na události",
  },

  async seed(tx: TxClient, ctx: DemoSeedContext) {
    const { core, now, rng } = ctx;
    const author = core.teachers.find((t) => t.id === DEMO_SHOWCASE_TEACHER_ID) ?? core.teachers[0];
    if (!author) throw new Error("Ukázkoví učitelé nenalezeni.");
    const coOrganizer = core.teachers.find((t) => t.id !== author.id);

    const day = workdayKey(now, 9);
    const slots = SLOTS.map((time, i) => {
      const startsAt = schoolDateTime(day, time)!;
      return { id: `demo-evi-${pad(i + 1, 2)}`, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60_000), order: i };
    });
    const closesAt = schoolDateTime(addDaysToDayKey(day, -1), "12:00")!;

    const bytes = Buffer.from(DEMO_IMAGE_WEBP_BASE64, "base64");
    await tx.eventImage.create({ data: { id: IMAGE_ID, data: bytes, mime: "image/webp", width: 320, height: 180, size: bytes.length, createdById: author.id } });
    await ctx.track("EventImage", [IMAGE_ID]);

    const slug = await uniqueSlug("den-otevrenych-dveri-ukazka", async (s) => !!(await tx.event.findUnique({ where: { slug: s }, select: { id: true } })));
    await tx.event.create({
      data: {
        id: EVENT_ID,
        slug,
        title: "Den otevřených dveří",
        subtitle: "Prohlídka školy pro budoucí studenty a jejich rodiče",
        place: "Hlavní budova školy, vstup A",
        contact: "prijimacky@ukazka.invalid",
        descriptionHtml:
          "<p>Přijďte se podívat, jak se u nás učí. Provedeme vás učebnami a laboratořemi, představíme studijní zaměření a odpovíme na vaše otázky.</p><ul><li>prohlídka školy s průvodcem (cca 50 minut),</li><li>ukázky výuky a pokusů,</li><li>informace o přijímacím řízení.</li></ul>",
        imageId: IMAGE_ID,
        imageAlt: "Budova školy za slunečného dne",
        status: "PUBLISHED",
        visibility: "PUBLIC",
        registrationOpensAt: new Date(now.getTime() - 5 * 24 * 3600_000),
        registrationClosesAt: closesAt,
        maxItemsPerRegistration: 1,
        allowGuests: true,
        maxGuests: 2,
        changeDeadlineMinutes: 1440,
        maxRegistrationsPerEmail: 1,
        confirmChannel: "EMAIL_AND_SCREEN",
        confirmationText: "Přijďte prosím o pět minut dřív a nahlaste se u vrátnice.",
        createdById: author.id,
        createdAt: new Date(now.getTime() - 7 * 24 * 3600_000),
        organizers: coOrganizer ? { create: [{ userId: coOrganizer.id }] } : undefined,
        items: { create: slots.map((s) => ({ ...s, label: null, capacity: CAPACITY })) },
        fields: {
          create: [
            ...FIXED_FIELDS.map((f, i) => ({
              key: f.key,
              type: f.type,
              label: f.label,
              // Ukázková událost se ptá i na školu a ročník dítěte
              mode: f.key === "school" || f.key === "grade" ? ("OPTIONAL" as const) : f.mode,
              order: i,
              builtin: true,
            })),
            { key: "custom_1", type: "SELECT", label: "Jak jste se o dni otevřených dveří dozvěděli?", mode: "OPTIONAL", options: SOURCES, order: FIXED_FIELDS.length, builtin: false },
          ],
        },
      },
    });
    await ctx.track("Event", [EVENT_ID]);

    // Registrace: každá na jeden termín, kapacita se nepřekročí; poslední je zrušená
    const taken = new Map<string, number>();
    const codes = new Set<string>();
    const rows: Prisma.EventRegistrationCreateManyInput[] = [];
    const links: { registrationId: string; itemId: string }[] = [];
    for (let n = 1; n <= REGISTRATIONS; n++) {
      const guests = rng.chance(0.3) ? rng.int(1, 2) : 0;
      const free = slots.filter((s) => (taken.get(s.id) ?? 0) + 1 + guests <= CAPACITY);
      // Dopoledne je oblíbenější: dřívější termíny se losují dvakrát
      const pool = free.flatMap((s, i) => (i < 4 ? [s, s] : [s]));
      const slot = rng.pick(pool);
      const cancelled = n === REGISTRATIONS;
      if (!cancelled) taken.set(slot.id, (taken.get(slot.id) ?? 0) + 1 + guests);
      let code = generateCode();
      while (codes.has(code)) code = generateCode();
      codes.add(code);
      const createdAt = new Date(now.getTime() - rng.int(30, 4 * 24 * 60) * 60_000);
      const id = `demo-evr-${pad(n, 3)}`;
      const answers: Record<string, string> = { phone: `+420 6${pad(rng.int(0, 99), 2)} ${pad(rng.int(100, 999), 3)} ${pad(rng.int(100, 999), 3)}`, school: rng.pick(SCHOOLS), grade: String(rng.int(8, 9)) };
      if (rng.chance(0.7)) answers.custom_1 = rng.pick(SOURCES);
      if (rng.chance(0.2)) answers.note = rng.pick(NOTES);
      rows.push({
        id,
        eventId: EVENT_ID,
        email: `rodic${pad(n, 2)}@ukazka.invalid`,
        name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
        guests,
        answers,
        status: cancelled ? "CANCELLED" : "CONFIRMED",
        tokenHash: hashToken(generateToken()),
        code,
        consentAt: createdAt,
        createdAt,
        cancelledAt: cancelled ? new Date(createdAt.getTime() + 3600_000) : null,
      });
      links.push({ registrationId: id, itemId: slot.id });
    }
    await tx.eventRegistration.createMany({ data: rows });
    await ctx.track("EventRegistration", rows.map((r) => r.id as string));
    await tx.eventRegistrationItem.createMany({ data: links });
  },

  async clear(tx: TxClient, ctx: DemoClearContext) {
    const users = ctx.ids("User");
    const events = ctx.ids("Event");
    // Registrace na ukázkové události (i ty, které vznikly po naplnění) padnou s událostí; registrace ukázkových
    // uživatelů na skutečné události jen ztratí vazbu na účet (onDelete: SetNull)
    await tx.eventRegistration.deleteMany({ where: { id: { in: ctx.ids("EventRegistration") } } });
    // Skutečné události a obrázky, které založil ukázkový učitel, převezme admin (stejně jako při mazání uživatele)
    await tx.event.updateMany({ where: { createdById: { in: users }, id: { notIn: events } }, data: { createdById: ctx.actor.id } });
    await tx.eventImage.updateMany({ where: { createdById: { in: users }, id: { notIn: ctx.ids("EventImage") } }, data: { createdById: ctx.actor.id } });
    await tx.event.deleteMany({ where: { id: { in: events } } });
    await tx.eventImage.deleteMany({ where: { id: { in: ctx.ids("EventImage") } } });
  },
};
