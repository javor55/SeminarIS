"use client";

import React, {
  createContext,
  useContext,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { User } from "@/lib/types";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import { stopImpersonation } from "@/modules/core/actions/impersonation";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  // Id zapnutých modulů
  enabledModules: string[];
  // Znovu načte session (např. po zapnutí/vypnutí modulu)
  refreshSession: () => Promise<void>;
   
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthContextWrapper>{children}</AuthContextWrapper>
    </SessionProvider>
  );
}

function AuthContextWrapper({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  
  const isLoading = status === "loading";
  const user = session?.user as User | null;
  const enabledModules = session?.enabledModules ?? [];

  // 🔐 Přihlášení přes NextAuth credentials provider
  const login = async (email: string, password?: string) => {
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    
    if (res?.error) {
      throw new Error(res.error);
    }
    
    // replace místo push – login stránka se nemá vracet v historii
    // Úvod ("/") podle role pošle studenta na zápis / dopisování, ostatní na dashboard
    router.replace("/");
    router.refresh();
  }

  // 🚪 Odhlášení
  async function logout() {
    // Náhled „zobrazit jako“ skončí odhlášením (cookie se smaže a zapíše se do historie)
    if (user?.impersonatedBy) await stopImpersonation().catch(() => undefined);
    await signOut({ redirect: false });
    router.push("/");
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        enabledModules,
        refreshSession: async () => {
          await update();
        },
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// 🪄 Snadné použití
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}