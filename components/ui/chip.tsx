import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Přepínací „čip“ (ročník, třída, předmět, učitel…): tlačítko s `aria-pressed`. Zvolený je plný,
 * nezvolený obrysový. `size="sm"` je menší varianta pro husté seznamy (třídy).
 */
export const Chip = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & { pressed: boolean; size?: "default" | "sm" }
>(({ pressed, size = "default", className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={pressed ? "default" : "outline"}
    aria-pressed={pressed}
    className={cn(
      "h-auto font-normal shadow-none",
      size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
      !pressed && "hover:bg-accent",
      className
    )}
    {...props}
  />
));
Chip.displayName = "Chip";
