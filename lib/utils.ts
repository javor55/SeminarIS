import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function computeEnrollmentStatus(
  statusEnum: "DRAFT" | "SCHEDULED" | string,
  startsAt: string | Date,
  endsAt: string | Date,
  now: Date = new Date()
) {
  // Pokud je okno jen Koncept (DRAFT), naprosto ignorujeme čas
  if (statusEnum === "DRAFT") {
    return {
      label: "Koncept (Uzavřeno)",
      className: "text-slate-500",
      is: "closed",
    };
  }

  // Jinak se u "SCHEDULED" řídíme striktně časem
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (now < start)
    return {
      label: "Naplánováno",
      className: "text-blue-600",
      is: "planned",
    };
  if (now >= start && now <= end)
    return { label: "Otevřeno", className: "text-emerald-600", is: "open" };
  return { label: "Uzavřeno", className: "text-slate-500", is: "closed" };
}
