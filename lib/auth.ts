import { NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers/index";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getEnabledModuleIds } from "@/lib/modules";
import {
  getAuthSettings,
  isMicrosoftActive,
  isMicrosoftConfigured,
  isPasswordLoginAllowed,
} from "@/lib/auth-settings";
import { getDefaultRole } from "@/modules/core/settings";

export const MICROSOFT_PROVIDER_ID = "azure-ad";

type MicrosoftProfile = {
  sub: string;
  name?: string;
  email?: string;
  preferred_username?: string;
};

// Přihlášení přes Microsoft 365 (Entra ID). Provider existuje jen tehdy, když jsou
// nastavené proměnné AZURE_AD_CLIENT_ID / AZURE_AD_CLIENT_SECRET / AZURE_AD_TENANT_ID.
// Tenant omezuje přihlášení na účty školy.
function microsoftProvider(): Provider[] {
  if (!isMicrosoftConfigured()) return [];
  return [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      // Vlastní profil bez stahování fotky (base64 obrázek by zbytečně nafoukl session cookie).
      // Školní účty nemusí mít claim `email`, proto záloha na UPN (preferred_username).
      profile(profile: MicrosoftProfile) {
        return {
          id: profile.sub,
          name: profile.name ?? null,
          email: (profile.email ?? profile.preferred_username ?? "").toLowerCase(),
          image: null,
        } as never;
      },
    }),
  ];
}

/** "Jan Novák" → { firstName: "Jan", lastName: "Novák" } (admin může později opravit). */
function splitName(name: string | null | undefined, email: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: email.split("@")[0], lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Heslo", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing credentials");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          omit: { passwordHash: false },
        });

        if (!user || !user.passwordHash) {
          throw new Error("Nesprávný e-mail nebo heslo");
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!isValid) {
          throw new Error("Nesprávný e-mail nebo heslo");
        }

        if (!user.isActive) {
          throw new Error("Tento účet byl deaktivován.");
        }

        // Když je zapnuté Microsoft 365, admin může heslo omezit jen na některé role
        if (!isPasswordLoginAllowed(await getAuthSettings(), user.role)) {
          throw new Error("Přihlášení heslem není pro váš účet povoleno. Přihlaste se přes Microsoft 365.");
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive,
        };
      },
    }),
    ...microsoftProvider(),
  ],
  callbacks: {
    // Přihlášení přes Microsoft: účet se páruje podle e-mailu s uživatelem v DB.
    // Vrácená URL = odmítnutí s chybou zobrazenou na přihlašovací stránce.
    async signIn({ user, account }) {
      if (account?.provider !== MICROSOFT_PROVIDER_ID) return true;

      const settings = await getAuthSettings();
      if (!isMicrosoftActive(settings)) return "/login?error=MicrosoftDisabled";

      const email = user.email?.toLowerCase();
      if (!email) return "/login?error=MicrosoftNoEmail";

      let dbUser = await prisma.user.findUnique({ where: { email } });
      if (!dbUser) {
        if (!settings.microsoftAutoCreate) return "/login?error=MicrosoftNotRegistered";
        const role = await getDefaultRole();
        dbUser = await prisma.user.create({
          data: {
            email,
            ...splitName(user.name, email),
            role,
            // Bez hesla – účet se přihlašuje přes Microsoft (heslo může nastavit admin)
            passwordHash: null,
          },
        });
      }
      if (!dbUser.isActive) return "/login?error=AccountDisabled";
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // U Microsoftu je `user` profil z Entra ID – nahradíme ho uživatelem z DB
        const dbUser =
          account?.provider === MICROSOFT_PROVIDER_ID
            ? await prisma.user.findUnique({ where: { email: user.email?.toLowerCase() ?? "" } })
            : user;
        if (!dbUser) {
          token.isActive = false;
          return token;
        }
        token.id = dbUser.id;
        token.email = dbUser.email;
        token.role = dbUser.role;
        token.firstName = dbUser.firstName;
        token.lastName = dbUser.lastName;
        token.isActive = dbUser.isActive;
        return token;
      }
      // Role a aktivita se při každém ověření session načtou z DB, aby změna role
      // nebo deaktivace účtu platila hned a ne až po novém přihlášení.
      if (token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true, isActive: true, firstName: true, lastName: true, email: true },
        });
        if (!fresh) {
          token.isActive = false;
        } else {
          token.role = fresh.role;
          token.isActive = fresh.isActive;
          token.firstName = fresh.firstName;
          token.lastName = fresh.lastName;
          token.email = fresh.email;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.email = token.email ?? session.user.email;
        session.user.role = token.role;
        session.user.firstName = token.firstName;
        session.user.lastName = token.lastName;
        session.user.isActive = token.isActive;
      }
      session.enabledModules = await getEnabledModuleIds();
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    // Chyby OAuth (např. zrušené přihlášení u Microsoftu) zobrazí přihlašovací stránka
    error: "/login",
  },
  events: {
    async signIn({ user }) {
      // Podle e-mailu – u Microsoftu je user.id identifikátor z Entra ID, ne naše id
      if (user?.email) {
        await prisma.user.updateMany({
          where: { email: user.email.toLowerCase() },
          data: { lastLoginAt: new Date() },
        });
      }
    },
  },
};
