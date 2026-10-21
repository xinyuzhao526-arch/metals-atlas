"use client";
import Link from "next/link";
import { useState } from "react";
import { PublicSourceDrawer } from "@/components/PublicSourceDrawer";
import { downloadCsv, type PublicSource } from "@/lib/public-data";
import type { SupplyAsset, SupplyConfig } from "@/lib/tin-iron-data";
function production(p: SupplyAsset) { return p.value === null ? "待补" : `${p.value.toLocaleString("en-US")} ${p.unit}`; }
export function SupplyResearch({ config: c, projectId }: { config: SupplyConfig; projectId?: string }) {
  const [source, setSource] = useState<PublicSource | null>(null);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const projects = c.projects.filter(p => (!projectId || p.id === projectId) && (country === "all" || country === p.country) && `${p.name} ${p.operator} ${p.country}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = projectId ? c.projects.find(p => p.id === projectId) : null;
  const openSource = (id: string) => setSource(c.sources.find(s => s.id === id) ?? null);
  const exportRows = () => downloadCsv(`metals-atlas-${c.slug}${projectId ? `-${projectId}` : ""}.csv`, projects.map(p => {
    const s = c.sources.find(s => s.id === p.sourceId);
    return { ...p, production_missing_reason: p.missing_reason.production, guidance_missing_reason: p.missing_reason.guidance, reserve_missing_reason: p.missing_reason.reserve, missing_reason: JSON.stringify(p.missing_reason), source_organization: s?.organization ?? null, source_title: s?.title ?? null, source_url: s?.url ?? null, source_type: s?.source_type ?? null, source_publication_date: s?.publication_date ?? null, verification_date: s?.verification_date ?? null };
  }));
  return <main className={`terminal lithium-terminal supply-research ${c.slug}-terminal`}>
    {projectId && <nav className="detail-nav"><Link href={`/${c.slug}`}>← {c.name}供给终端</Link></nav>}
    <section className="research-strip lithium-hero"><div className="metal-ident"><span className="metal-symbol">{c.symbol}</span><div><p>{c.name}供给研究终端</p><h1>{selected?.name ?? `${c.english} supply research`}</h1></div></div><dl className="research-stats lithium-stats"><div><dt>资产覆盖</dt><dd>{c.projects.length}</dd></div><div><dt>来源材料</dt><dd>{c.sources.length}</dd></div><div><dt>来源核验</dt><dd>{c.sources[0].verification_date}</dd></div></dl><div className="research-actions"><button onClick={exportRows} type="button">导出 CSV</button></div><p className="supply-thesis"><b>口径说明</b>{c.scope}</p></section>
    <section className="lithium-intro"><div><span className="lithium-overline">{c.symbol.toUpperCase()} / SUPPLY CHAIN</span><h2>沿着产品阶段，<br/>追溯供给证据。</h2></div><p>首批仅展示已录入的官方历史披露。报告期间、权益口径和生效日期逐项保留；来源核验日期不代表产量发生日期。指引和储量尚未录入，保持缺失。</p></section>
    <section className="matrix-section"><div className="section-heading"><div><span>01 / 项目研究矩阵</span><h2>{projectId ? "项目生产档案" : `${c.name}供应资产`}</h2></div><p>{projects.length} 个资产 · 不汇总不同口径</p></div>
      {!projectId && <div className="matrix-toolbar lithium-toolbar"><input aria-label={`搜索${c.name}项目`} placeholder="搜索项目、国家或运营方" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="筛选国家" value={country} onChange={e => setCountry(e.target.value)}><option value="all">全部国家</option>{[...new Set(c.projects.map(p => p.country))].map(x => <option key={x}>{x}</option>)}</select></div>}
      <div className="supply-asset-grid">{projects.map(p => <article className="supply-asset" key={p.id}><header><span>{p.country} / {p.stage}</span><h3><Link href={`/${c.slug}/projects/${p.id}`}>{p.name} →</Link></h3><p>{p.operator}</p></header><dl><div><dt>披露产量 · {p.product}</dt><dd className="supply-production">{production(p)}</dd></div><div><dt>报告期间</dt><dd>{p.period}</dd></div><div><dt>权益口径</dt><dd>{p.basis}</dd></div><div><dt>数据生效日</dt><dd>{p.effective_date}</dd></div><div><dt>当前指引</dt><dd>{p.guidance ?? "待补 / 本批未录入"}</dd></div><div><dt>储量</dt><dd>{p.reserve ?? "待补 / 本批未录入"}</dd></div></dl><button className="evidence-link" type="button" onClick={() => openSource(p.sourceId)}>查看来源证据 ↗</button></article>)}</div>
      {projects.length === 0 && <p className="detail-missing-block" role="status">没有匹配的资产，请调整筛选条件。</p>}
    </section>
    <section className="detail-evidence"><div className="section-heading"><div><span>02 / 来源索引</span><h2>官方披露与核验记录</h2></div></div><div>{c.sources.map(s => <button type="button" key={s.id} onClick={() => setSource(s)}><span>{s.tier}</span><b>{s.title}</b><small>{s.organization} · 发布 {s.publication_date} · 核验 {s.verification_date}</small></button>)}</div></section>
    <PublicSourceDrawer source={source} onClose={() => setSource(null)} />
  </main>;
}

