import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Nativní <select> vzhledově sladěný se Select z shadcn/ui. Používá se tam, kde je
 * výhodnější prohlížečový výběr: hodně řádků (tabulky), formuláře, testovatelnost.
 * `className` určuje šířku/okraje obalu, `compact` menší výšku do tabulek.
 */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }
>(({ className, compact, children, ...props }, ref) => (
  <div className={cn("relative w-full", className)}>
    <select
      ref={ref}
      className={cn(
        "w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm shadow-sm ring-offset-background",
        "focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        "[color-scheme:light] dark:[color-scheme:dark]",
        compact ? "h-8" : "h-9"
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
  </div>
));
NativeSelect.displayName = "NativeSelect";
