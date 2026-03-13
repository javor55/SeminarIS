import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Admin-only routes
    if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Users page – only ADMIN and TEACHER
    if (pathname.startsWith("/users") && token?.role !== "ADMIN" && token?.role !== "TEACHER") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

// Protect all routes except public ones
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/users/:path*",
    "/subjects/:path*",
    "/enrollments/:path*",
    "/profile/:path*",
    "/settings/:path*",
  ],
};
