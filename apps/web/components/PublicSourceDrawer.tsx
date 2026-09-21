"use client";

import { useEffect } from "react";
import type { PublicSource } from "@/lib/public-data";

export function PublicSourceDrawer({ source, onClose }: { source: PublicSource | null; onClose: () => void }) {
  useEffect(() => {
    if (!source) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [source, onClose]);

  if (!source) return null;
  return <div className="public-drawer-backdrop" role="presentation" onClick={onClose}>
    <aside className="public-drawer" role="dialog" aria-modal="true" aria-label="来源详情" onClick={(event) => event.stopPropagation()}>
      <div className="public-drawer-head">
        <div><div className="public-kicker">SOURCE EVIDENCE · {source.tier} 级</div><h2>{source.title}</h2><p>{source.organization}</p></div>
        <button className="public-icon-button" type="button" onClick={onClose} aria-label="关闭来源详情">×</button>
      </div>
      <div className="public-drawer-body">
        <div className="public-source-meta"><span>发布日期</span><strong>{source.publication_date ?? "待补"}</strong></div>
        <div className="public-source-meta"><span>核验日期</span><strong>{source.verification_date}</strong></div>
        <div className="public-source-meta"><span>材料类型</span><strong>{source.source_type}</strong></div>
        <section><div className="public-label">原文定位</div><p className="public-locator">{source.locator}</p></section>
        {source.short_excerpt && <section><div className="public-label">短摘录</div><blockquote>{source.short_excerpt}</blockquote></section>}
        <section><div className="public-label">来源 URL</div><p className="public-url">{source.url}</p></section>
      </div>
      <div className="public-drawer-actions"><a className="public-button primary" href={source.url} target="_blank" rel="noopener noreferrer">打开原始材料 ↗</a><button className="public-button" type="button" onClick={() => navigator.clipboard.writeText(source.url)}>复制链接</button></div>
    </aside>
  </div>;
}
