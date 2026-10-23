// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AppShell } from "@/components/app-shell";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config";

export const metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-screen">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <SpeedInsights />
        <Analytics />
      </body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID as string} />
    </html>
  );
}
