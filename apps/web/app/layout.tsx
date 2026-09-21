import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Metals Atlas · 公开金属供给数据",
  description: "可直接访问、可追溯到原始材料的全球金属项目与供给事件数据。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" /></head>
      <body>
        <header className="site-topbar">
          <Link href="/copper" className="site-brand"><span className="site-brand-mark">M/A</span><span>Metals Atlas</span></Link>
          <span className="site-edition">研究公开版 · 铜</span>
        </header>
        {children}
        <footer className="site-footer"><span>Metals Atlas · 铜供给研究终端</span><span>缺失值保持 null · 近似坐标明确标注 · 不汇总不兼容口径</span></footer>
      </body>
    </html>
  );
}
