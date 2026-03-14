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
