"use client";

import { AudiencePickerBase, emptyAudienceState, type AudiencePickerApi, type AudiencePickerTexts, type AudienceState } from "@/modules/core/components/audience/AudiencePicker";
import { getAudienceOptions, previewAudience, searchAudienceStudents } from "@/modules/seminars/actions/windows";

export { emptyAudienceState };
export type { AudienceState };

const API: AudiencePickerApi = { getOptions: getAudienceOptions, searchStudents: searchAudienceStudents, preview: previewAudience };

const TEXTS: AudiencePickerTexts = {
  title: "Publikum zápisu (komu je určen)",
  description:
    "Zápis uvidí a mohou se do něj zapsat studenti z vybraných ročníků, tříd a konkrétní studenti, kromě vynechaných. Nevybráno nic = všichni aktivní studenti.",
  countText: (n) => (n === 0 ? "Zápis se nikoho netýká." : `Zápis je určen ${n} ${n === 1 ? "studentovi" : "studentům"}.`),
};

/** Výběr publika zápisového okna (viz společná komponenta v jádru). */
export function AudiencePicker({ value, onChange }: { value: AudienceState; onChange: (_: AudienceState) => void }) {
  return <AudiencePickerBase value={value} onChange={onChange} api={API} texts={TEXTS} />;
}
