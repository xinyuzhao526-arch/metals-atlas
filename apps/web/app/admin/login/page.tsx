"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "expired") setNotice("登录已过期，请重新登录");
    if (reason === "logged-out") setNotice("已安全退出，请重新登录");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = await apiFetch<{ csrf_token: string }>("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem("csrf_token", data.csrf_token);
      window.location.replace("/admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
      setBusy(false);
    }
  }

  return <main className="page"><div className="login-wrap panel"><div className="panel-head"><div><div className="eyebrow">DATA REVIEW DESK</div><h2>管理员登录</h2></div></div><form className="form" onSubmit={submit}>
    <label>邮箱<input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>密码<input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {notice && <div className="notice" role="status">{notice}</div>}
    {error && <div className="error">{error}</div>}
    <button className="button" disabled={busy}>{busy ? "正在登录…" : "登录"}</button>
  </form></div></main>;
}
