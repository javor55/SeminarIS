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
