import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  // Text vedle políčka; celý řádek je klikací. Bez něj je nutné předat `aria-label`.
  label?: React.ReactNode;
  // Třída obalu s popiskem (políčko samotné stylují `className`)
  labelClassName?: string;
}

/**
 * Zaškrtávací políčko ve stylu shadcn/ui. Uvnitř je nativní `<input type="checkbox">` (přístupné, funguje
 * s formuláři a ve čtečkách i testech), vzhled přebírá z barev motivu (`accent-primary`, světlý i tmavý režim).
 * S `label` vykreslí i klikací popisek; bez něj předejte `aria-label`.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, label, labelClassName, ...props }, ref) => {
  const input = (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded border border-input bg-background accent-primary shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark]",
        className
      )}
      {...props}
    />
  );
  if (label === undefined) return input;
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm", props.disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer", labelClassName)}>
      {input}
      <span>{label}</span>
    </label>
  );
});
Checkbox.displayName = "Checkbox";

/** Přepínač „jedna z možností“ (radio) ve stejném stylu jako Checkbox; skupinu tvoří společné `name`. */
export const Radio = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="radio"
    className={cn(
      "h-4 w-4 shrink-0 cursor-pointer accent-primary",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark]",
      className
    )}
    {...props}
  />
));
Radio.displayName = "Radio";
