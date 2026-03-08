"use client";

import React, {
  createContext,
  useContext,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { User } from "@/lib/types";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
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
  const { data: session, status } = useSession();
  
  const isLoading = status === "loading";
  const user = session?.user as User | null;

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
    
    router.push("/dashboard");
  }

  // 🚪 Odhlášení
  async function logout() {
    await signOut({ redirect: false });
    router.push("/");
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
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