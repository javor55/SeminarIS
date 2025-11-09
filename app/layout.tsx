// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";
import { Toaster } from "sonner"; // ⬅️ přidáme
import { AuthProvider } from "@/components/auth/auth-provider";

export const metadata = {
  title: "Zápis seminářů",
  description: "Mock frontend pro zápis seminářů",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-screen">
        <AuthProvider>
          {children}
          <Toaster position="top-right" richColors closeButton /> {/* ⬅️ tady */}
        </AuthProvider>
      </body>
    </html>
  );
}
