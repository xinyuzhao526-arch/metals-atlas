"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { classifyAdminFailure } from "@/lib/admin-auth";
import { apiFetch, csrfHeaders } from "@/lib/api";

type AdminUser = { id: string; email: string; display_name: string };

type AdminSessionValue = {
  user: AdminUser | null;
  handleAdminFailure: (reason: unknown) => boolean;
  returnToLogin: () => void;
};

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function useAdminSession(): AdminSessionValue {
  const value = useContext(AdminSessionContext);
  if (!value) throw new Error("Admin session is unavailable");
  return value;
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(!isLogin);
  const [securityError, setSecurityError] = useState("");

  const returnToLogin = useCallback(() => {
    sessionStorage.removeItem("csrf_token");
    setUser(null);
    window.location.replace("/admin/login?reason=expired");
  }, []);

  const handleAdminFailure = useCallback((reason: unknown) => {
    const failure = classifyAdminFailure(reason);
    if (failure.kind === "session") {
      sessionStorage.removeItem("csrf_token");
      setUser(null);
      window.location.replace("/admin/login?reason=expired");
      return true;
    }
    if (failure.kind === "csrf") {
      setSecurityError(failure.message);
      return true;
    }
    return false;
  }, []);

  const validateSession = useCallback(async () => {
    if (isLogin) return;
    setChecking(true);
    try {
      const current = await apiFetch<AdminUser>("/api/v1/auth/me");
      setUser(current);
      setSecurityError("");
    } catch (reason) {
      if (!handleAdminFailure(reason)) returnToLogin();
    } finally {
      setChecking(false);
    }
  }, [handleAdminFailure, isLogin, returnToLogin]);

  useEffect(() => {
    if (isLogin) return;
    void validateSession();
    const verifyRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) void validateSession();
    };
    window.addEventListener("pageshow", verifyRestoredPage);
    return () => window.removeEventListener("pageshow", verifyRestoredPage);
  }, [isLogin, validateSession]);

  async function logout() {
    setSecurityError("");
    try {
      await apiFetch<{ ok: boolean }>("/api/v1/auth/logout", {
        method: "POST",
        headers: csrfHeaders(),
        body: "{}",
      });
      sessionStorage.removeItem("csrf_token");
      setUser(null);
      window.location.replace("/admin/login?reason=logged-out");
    } catch (reason) {
      if (!handleAdminFailure(reason)) {
        setSecurityError(reason instanceof Error ? reason.message : "退出失败");
      }
    }
  }

  const context = useMemo(
    () => ({ user, handleAdminFailure, returnToLogin }),
    [handleAdminFailure, returnToLogin, user],
  );

  if (isLogin) return <>{children}</>;
  if (checking || !user) {
    return <main className="page"><div className="panel admin-loading">正在验证管理员会话…</div></main>;
  }

  return (
    <AdminSessionContext.Provider value={context}>
      <div className="admin-session-bar">
        <nav className="admin-nav" aria-label="管理后台导航">
          <Link className={pathname === "/admin" ? "active" : ""} href="/admin">概览</Link>
          <Link className={pathname.startsWith("/admin/projects") ? "active" : ""} href="/admin/projects">项目</Link>
          <Link href="/admin#excel-import">Excel 导入</Link>
          <Link href="/admin#reviews">待审核</Link>
        </nav>
        <div className="admin-session-user">
          <span className="admin-session-label">当前管理员</span>
          <strong>{user.display_name || user.email}</strong>
          {user.display_name && <span className="meta">{user.email}</span>}
        </div>
        <button className="button secondary" type="button" onClick={logout}>退出登录</button>
      </div>
      {securityError && (
        <div className="security-alert" role="alert">
          <span>{securityError}</span>
          <button className="button secondary" type="button" onClick={returnToLogin}>返回登录</button>
        </div>
      )}
      {children}
    </AdminSessionContext.Provider>
  );
}
