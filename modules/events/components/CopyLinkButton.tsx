"use client";

import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Zkopíruje veřejný odkaz události (`/akce/<slug>`) do schránky. */
export function CopyLinkButton({ slug, size = "sm" }: { slug: string; size?: "sm" | "default" }) {
  async function copy() {
    const url = `${window.location.origin}/akce/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Odkaz zkopírován.");
    } catch {
      // Schránka nemusí být dostupná (nezabezpečené spojení, zakázané oprávnění): odkaz aspoň ukážeme
      toast.message("Zkopírujte odkaz ručně:", { description: url, duration: 15000 });
    }
  }
  return (
    <Button type="button" variant="outline" size={size} onClick={copy} data-testid="copy-event-link">
      <Link2 className="mr-1.5 h-4 w-4" /> Kopírovat odkaz
    </Button>
  );
}
