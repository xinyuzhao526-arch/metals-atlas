import { NextRequest, NextResponse } from "next/server";
import { requiresAdminLogin } from "@/lib/admin-route";


export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (requiresAdminLogin(pathname, Boolean(request.cookies.get("atlas_session")))) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("reason", "expired");
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}


export const config = {
  matcher: ["/admin/:path*"],
};
