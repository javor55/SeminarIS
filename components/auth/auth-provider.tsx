"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { User } from "@/lib/types";
import { users } from "@/lib/mock-db"; // ⬅️ použijeme mock uživatele z databáze

type AuthContextValue = {
  user: User | null;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  mockUsers: User[];
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  // 🧭 při startu načteme usera z localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("zapis_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed);
      } catch {
        // ignore error
      }
    }
  }, []);

  // 💾 při změně usera uložíme do localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (user) {
      window.localStorage.setItem("zapis_user", JSON.stringify(user));
    } else {
      window.localStorage.removeItem("zapis_user");
    }
  }, [user]);

  // 🔐 Přihlášení – jen podle e-mailu
  const login = async (email: string, password?: string) => {
    const found = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (!found) {
      throw new Error("Uživatel s tímto e-mailem nebyl nalezen.");
    }

    setUser(found);
    // po přihlášení přesměrujeme třeba na dashboard
    router.push("/dashboard");
  }

  // 🚪 Odhlášení – smaže usera a přesměruje na úvod
  async function logout() {
    setUser(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("zapis_user");
    }
    router.push("/"); // přesměrování na úvodní stránku
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        mockUsers: users, // dostupní mock uživatelé
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
