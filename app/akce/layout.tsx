import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/app-config";
import { appUrl } from "@/lib/email/url";

// Veřejné stránky událostí mají vlastní jednoduchý layout bez navigace aplikace (AppShell se na /akce nevykresluje).
export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  robots: { index: false, follow: false },
};

export default function PublicEventsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30" data-testid="public-shell">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-4">
          <span className="truncate text-base font-semibold" data-testid="public-school">{APP_NAME}</span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t bg-background">
        <div className="mx-auto w-full max-w-2xl px-4 py-5 text-sm text-muted-foreground">
          <Link href="/ochrana-udaju" className="underline underline-offset-4 hover:text-foreground" data-testid="public-privacy-link">Zpracování osobních údajů</Link>
        </div>
      </footer>
    </div>
  );
}
