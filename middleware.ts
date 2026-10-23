import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { can, getRoutePermission } from "@/modules/registry";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;

    // Oprávnění k cestám deklarují moduly ve svých manifestech (routes)
    const permission = getRoutePermission(req.nextUrl.pathname);
    if (permission && !can(token?.role, permission)) {
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
