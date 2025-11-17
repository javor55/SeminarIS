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
import { users } from "@/lib/mock-db";

// ZMĚNA 1: Rozšíření typu o 'isLoading'
type AuthContextValue = {
  user: User | null;
  isLoading: boolean; // <-- Přidáno
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  mockUsers: User[];
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  
  // ZMĚNA 2: Přidání 'isLoading' stavu, výchozí je 'true'
  const [isLoading, setIsLoading] = useState(true);

  // 🧭 při startu načteme usera z localStorage
  useEffect(() => {
    // Vaše logika byla v pořádku, jen musíme na konci
    // nastavit 'isLoading' na 'false'
    
    // Okamžitě nastavíme 'true' na začátku (i když je to teď výchozí)
    setIsLoading(true); 
    
    if (typeof window === "undefined") {
      setIsLoading(false); // Jsme na serveru, nenačítáme
      return;
    }
    
    try {
      const saved = window.localStorage.getItem("zapis_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        setUser(parsed);
      }
    } catch {
      // ignore error, user zůstane null
    }
    
    // ZMĚNA 3: Klíčový krok. Až PO kontrole localStorage
    // prohlásíme, že načítání skončilo.
    setIsLoading(false);
    
  }, []); // Tento efekt se spustí jen jednou

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
    router.push("/dashboard");
  }

  // 🚪 Odhlášení – smaže usera a přesměruje na úvod
  async function logout() {
    setUser(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("zapis_user");
    }
    router.push("/");
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading, // ZMĚNA 4: Poskytnutí 'isLoading' stavu
        login,
        logout,
        mockUsers: users,
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