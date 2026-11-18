import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getSetting } from "@/lib/settings-registry";

// Veřejná stránka (dostupná bez přihlášení); text se čte z nastavení při každém zobrazení.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Zpracování osobních údajů" };

type Block = { type: "heading" | "paragraph"; text: string };

/** Text z nastavení → bloky: prázdný řádek odděluje odstavce, řádek „# …“ je mezititulek. Nic se nevkládá jako HTML. */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n");
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ type: "paragraph", text: para.join("\n") });
      para = [];
    };
    for (const line of lines) {
      if (line.startsWith("# ")) {
        flush();
        blocks.push({ type: "heading", text: line.slice(2).trim() });
      } else if (line.trim()) para.push(line);
    }
    flush();
  }
  return blocks;
}

export default async function PrivacyPage() {
  const [text, controller] = await Promise.all([getSetting<string>("privacy.text"), getSetting<string>("privacy.controller")]);
  const blocks = parseBlocks(text);

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="privacy-page">
      <PageHeader title="Zpracování osobních údajů" description={controller ? `Správce: ${controller}` : undefined} />

      <div className="space-y-3 text-sm leading-relaxed">
        {blocks.map((b, i) =>
          b.type === "heading" ? (
            <h2 key={i} className="pt-3 text-base font-semibold">{b.text}</h2>
          ) : (
            <p key={i} className="whitespace-pre-line">{b.text}</p>
          )
        )}
      </div>

      <section className="space-y-2 border-t pt-4 text-sm" data-testid="privacy-cookies">
        <h2 className="text-base font-semibold">Cookies</h2>
        <p>Používáme jen nezbytné cookies, proto nepotřebujete nic potvrzovat:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>přihlášení (relace přihlášeného uživatele),</li>
          <li>režim „zobrazit jako“ (jen pro administrátory).</li>
        </ul>
        <p>Měření návštěvnosti přes Vercel Analytics cookies nepoužívá. Písma jsou součástí aplikace.</p>
      </section>

      <p className="text-sm">
        <Link href="/" className="text-primary hover:underline">Zpět na úvod</Link>
      </p>
    </div>
  );
}
