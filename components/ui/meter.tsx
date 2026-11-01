import { cn } from "@/lib/utils";

/**
 * Tenký pruh obsazenosti / dokončení (jen zobrazení). Plné obsazení = červený, skoro plné = žlutý,
 * jinak neutrální; `tone` jde přepsat (např. zelený pro „hotovo“). Popisek `label` čtou čtečky obrazovky.
 */
export function Meter({
  value,
  max,
  label,
  tone,
  className,
}: {
  value: number;
  // Kapacita; bez ní (neomezeno) se pruh nevykreslí plný
  max: number | null;
  label: string;
  tone?: "neutral" | "success";
  className?: string;
}) {
  const pct = max && max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = tone === "success" ? "bg-success" : pct >= 100 ? "bg-danger" : pct >= 90 ? "bg-warning" : "bg-primary/70";
  return (
    <div role="img" aria-label={label} className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
