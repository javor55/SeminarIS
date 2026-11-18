"use server";

import { requirePermission } from "@/lib/session";
import type { AudienceDraft } from "@/modules/core/audience";
import { listClassOptions, previewAudienceDraft, searchAudienceStudentsBy } from "@/modules/core/audience-db";

// Nabídka pro výběr publika události (společná komponenta z jádra); stejné dotazy jako u zápisů.

export async function getEventAudienceOptions() {
  await requirePermission("events.manage.own");
  return listClassOptions();
}

export async function searchEventAudienceStudents(query: string) {
  await requirePermission("events.manage.own");
  return searchAudienceStudentsBy(query);
}

export async function previewEventAudience(draft: AudienceDraft) {
  await requirePermission("events.manage.own");
  return previewAudienceDraft(draft);
}
