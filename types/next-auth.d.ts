import { Role } from "@/lib/types";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    role: Role;
    firstName: string;
    lastName: string;
    isActive: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      role: Role;
      firstName: string;
      lastName: string;
      isActive: boolean;
      // Jen v režimu „zobrazit jako“: session ukazuje cílového uživatele, tady je skutečný admin
      classLabel?: string | null;
      impersonatedBy?: { id: string; name: string } | null;
    };
    // Id zapnutých modulů (pro sestavení menu na klientovi)
    enabledModules: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    firstName: string;
    lastName: string;
    isActive: boolean;
  }
}
