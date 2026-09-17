export function requiresAdminLogin(pathname: string, hasSessionCookie: boolean): boolean {
  return pathname.startsWith("/admin")
    && pathname !== "/admin/login"
    && !hasSessionCookie;
}
