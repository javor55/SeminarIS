import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { can, getRoutePermission } from "@/modules/registry";
import { IMPERSONATION_COOKIE, verifyImpersonation } from "@/lib/impersonation-token";

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token;

    // Role, podle které se hlídají cesty. V režimu „zobrazit jako“ je to role zobrazovaného
    // uživatele – ale jen s platným podpisem cookie, který patří přihlášenému adminovi.
    // (Role v cookie je jen pro přesměrování; server oprávnění vždy znovu ověří v DB.)
    let role = token?.role;
    if (token?.role === "ADMIN") {
      const impersonation = await verifyImpersonation(
        req.cookies.get(IMPERSONATION_COOKIE)?.value,
        process.env.NEXTAUTH_SECRET
      );
      if (impersonation && impersonation.a === token.id) role = impersonation.r as typeof role;
    }

    // Oprávnění k cestám deklarují moduly ve svých manifestech (routes)
    const permission = getRoutePermission(req.nextUrl.pathname);
    if (permission && !can(role, permission)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token && token.isActive !== false,
    },
  }
);

// Chráněno je vše kromě veřejné úvodní stránky, přihlášení/registrace, API a statických souborů.
// (Matcher musí být statický, proto se negeneruje z registru modulů.)
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|register).+)"],
};
