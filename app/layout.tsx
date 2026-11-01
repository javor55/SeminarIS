// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AppShell } from "@/components/app-shell";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config";
import { getCurrentUser } from "@/lib/session";
import { getStudentNav, type StudentNav } from "@/modules/core/student-nav";

/** Navigace studenta; učitel, admin, host a nepřihlášený ji nemají. Chyba nesmí shodit celou aplikaci. */
async function loadStudentNav(): Promise<StudentNav | null> {
  try {
    const user = await getCurrentUser();
    return user?.role === "STUDENT" ? await getStudentNav(user) : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Navigaci studenta se nepodařilo načíst:", e);
    return null;
  }
}

export const metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

// Zjednodušená navigace studenta (F12) se počítá na serveru z jeho oken a termínů, proto layout čte session.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const studentNav = await loadStudentNav();
  return (
    <html lang="cs">
      <body className="min-h-screen">
        <AuthProvider>
          <AppShell studentNav={studentNav}>{children}</AppShell>
        </AuthProvider>
        <SpeedInsights />
        <Analytics />
      </body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID as string} />
    </html>
  );
}
