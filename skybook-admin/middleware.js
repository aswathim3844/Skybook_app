import { NextResponse } from "next/server";

const protectedPaths = [
  "/dashboard",
  "/bookings",
  "/flights",
  "/hotels",
  "/cars",
];

export function middleware(request) {
  const token = request.cookies.get("skybook_admin_token")?.value;
  const { pathname } = request.nextUrl;
  const requiresAuth = protectedPaths.some((path) => pathname.startsWith(path));

  if (requiresAuth && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/bookings/:path*", "/flights/:path*", "/hotels/:path*", "/cars/:path*"],
};
