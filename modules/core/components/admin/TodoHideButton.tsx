"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";
import { unwrap } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { hideAdminTodo, showHiddenAdminTodos } from "@/modules/core/actions/admin";

/** „Nezobrazovat“ u informační položky přehledu (jen správce; uloží se do nastavení systému). */
export function TodoHideButton({ todoId }: { todoId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 text-muted-foreground"
      disabled={busy}
      data-testid="todo-hide"
      onClick={async () => {
        setBusy(true);
        try {
          unwrap(await hideAdminTodo(todoId));
          toast.success("Informace se už nebude zobrazovat.");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message || "Nepodařilo se uložit.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <EyeOff className="h-3.5 w-3.5" /> Nezobrazovat
    </Button>
  );
}

/** „Zobrazit skryté informace“ (n) pod seznamem. */
export function TodoShowHiddenButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="link"
      size="sm"
      className="h-auto p-0 text-xs"
      disabled={busy}
      data-testid="todo-show-hidden"
      onClick={async () => {
        setBusy(true);
        try {
          unwrap(await showHiddenAdminTodos());
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message || "Nepodařilo se uložit.");
        } finally {
          setBusy(false);
        }
      }}
    >
      Zobrazit skryté informace ({count})
    </Button>
  );
}
