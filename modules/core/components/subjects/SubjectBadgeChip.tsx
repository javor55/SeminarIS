import Link from "next/link";
import type { SubjectBadge } from "@/modules/types";

const CLASSES =
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-500/30";

/** Štítek předmětu dodaný modulem; s odkazem, když ho modul uvedl. */
export function SubjectBadgeChip({ badge }: { badge: SubjectBadge }) {
  return badge.href ? (
    <Link href={badge.href} className={`${CLASSES} hover:underline`}>
      {badge.label}
    </Link>
  ) : (
    <span className={CLASSES}>{badge.label}</span>
  );
}
