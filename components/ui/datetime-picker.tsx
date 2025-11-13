"use client";
import * as React from "react";
// Použijeme 'cs' (češtinu) pro formátování data
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DateTimePickerProps = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  className?: string;
};

export function DateTimePicker({
  value,
  onChange,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Rozdělíme Date objekt na datum (pro kalendář) a čas (pro input)
  const date = value;
  // Formát 'HH:mm' je důležitý pro <Input type="time">
  const time = value ? format(value, "HH:mm") : "00:00";

  const handleDateSelect = (selectedDay: Date | undefined) => {
    if (!selectedDay) {
      onChange(null);
      return;
    }

    // Zkombinujeme vybraný den s existujícím časem
    const [hours, minutes] = time.split(":").map(Number);
    const newDate = new Date(selectedDay);
    newDate.setHours(hours, minutes, 0, 0); // setHours(h, m, s, ms)
    onChange(newDate);
    // Po výběru data nechceme hned zavřít, uživatel možná chce měnit čas
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeValue = e.target.value;
    if (!timeValue) return;

    // Zkombinujeme existující datum (nebo dnešek) s novým časem
    const [hours, minutes] = timeValue.split(":").map(Number);
    const newDate = value ? new Date(value) : new Date();
    newDate.setHours(hours, minutes, 0, 0);
    onChange(newDate);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "h-8 justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className // Přidáme možnost externí třídy
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? (
            format(date, "d. M. yyyy HH:mm", { locale: cs })
          ) : (
            <span>Vyberte datum a čas</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date ?? undefined}
          onSelect={handleDateSelect}
          initialFocus
          locale={cs} // Použijeme českou lokalizaci
        />
        {/* Oddělený vstup pro čas */}
        <div className="p-3 border-t">
          <Input type="time" value={time} onChange={handleTimeChange} />
        </div>
      </PopoverContent>
    </Popover>
  );
}