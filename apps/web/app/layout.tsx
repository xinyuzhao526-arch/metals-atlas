import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "全球金属供给图谱",
  description: "可追溯、经人工审核的全球金属供给研究数据。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="topbar">
          <Link href="/" className="brand"><span className="brand-mark">M</span><span>金属供给图谱</span></Link>
          <span className="edition">GLOBAL SUPPLY ATLAS · PHASE 1A</span>
          <nav><Link href="/">项目数据</Link><Link href="/admin">数据管理</Link></nav>
        </header>
        {children}
        <footer><span>全球金属供给图谱 · Phase 1A</span><span>公开数据仅来自“接受并发布”的审核记录</span></footer>
      </body>
    </html>
  );
}

