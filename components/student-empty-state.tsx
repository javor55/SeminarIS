import { CalendarClock } from "lucide-react";

/** Student, pro kterého teď není otevřený žádný zápis ani vypsaný termín dopisování (F12). */
export function StudentEmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-2 py-12 text-center" data-testid="student-empty">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarClock className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Teď tu nic nečeká</h1>
      <p className="text-sm text-muted-foreground">
        Není otevřený žádný zápis seminářů ani vypsaný termín dopisování. Až se něco otevře, dáme vám vědět e-mailem.
      </p>
    </div>
  );
}
