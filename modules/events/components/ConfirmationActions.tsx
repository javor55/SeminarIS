"use client";

import { useState } from "react";
import { CalendarPlus, Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  link: string;
  code: string;
  /** Adresa `.ics` souboru (vytváří ji správa registrace) */
  icsHref: string;
  /** Hotový text potvrzení ke stažení */
  fileText: string;
  fileName: string;
};

/** Tlačítka stránky „hotovo“: zkopírovat odkaz, stáhnout potvrzení (.txt) a přidat do kalendáře. Token nikam neposílá. */
export function ConfirmationActions({ link, code, icsHref, fileText, fileName }: Props) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  async function copy(what: "link" | "code") {
    const value = what === "link" ? link : code;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // starší prohlížeč nebo nezabezpečený kontext: záloha přes skrytý prvek
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([fileText], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-testid="confirmation-actions">
      <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => copy("link")} data-testid="copy-link">
        {copied === "link" ? <Check className="text-success" /> : <Copy />} {copied === "link" ? "Odkaz zkopírován" : "Zkopírovat odkaz"}
      </Button>
      <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => copy("code")} data-testid="copy-code">
        {copied === "code" ? <Check className="text-success" /> : <Copy />} {copied === "code" ? "Kód zkopírován" : "Zkopírovat kód"}
      </Button>
      <Button type="button" variant="outline" className="h-11 md:h-9" onClick={download} data-testid="download-confirmation">
        <Download /> Stáhnout potvrzení
      </Button>
      <Button asChild variant="outline" className="h-11 md:h-9">
        <a href={icsHref} data-testid="add-to-calendar">
          <CalendarPlus /> Přidat do kalendáře
        </a>
      </Button>
    </div>
  );
}
