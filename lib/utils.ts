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
      className: "text-muted-foreground",
      is: "closed",
    };
  }

  // Jinak se u "SCHEDULED" řídíme striktně časem
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (now < start)
    return {
      label: "Naplánováno",
      className: "text-info",
      is: "planned",
    };
  if (now >= start && now <= end)
    return { label: "Otevřeno", className: "text-success", is: "open" };
  return { label: "Uzavřeno", className: "text-muted-foreground", is: "closed" };
}
