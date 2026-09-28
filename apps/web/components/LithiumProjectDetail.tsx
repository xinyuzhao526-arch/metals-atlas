"use client";

import Link from "next/link";
import { useState } from "react";
import { PublicSourceDrawer } from "@/components/PublicSourceDrawer";
import { downloadCsv, type PublicSource } from "@/lib/public-data";
import { lithiumEvents, lithiumProjectBySlug, lithiumSourceById } from "@/components/LithiumDataProduct";

export function LithiumProjectDetail({ slug }: { slug: string }) {
  const [source, setSource] = useState<PublicSource | null>(null);
  const project = lithiumProjectBySlug(slug);
  if (!project) return <main className="detail-terminal"><div className="detail-empty">锂项目不存在。</div></main>;
  const event = lithiumEvents.find((item) => item.projectId === project.id);
  const sourceItem = lithiumSourceById(project.sourceId);
  const exportProject = () => downloadCsv(`metals-atlas-lithium-${project.id}.csv`, [{
    project:project.name,country:project.country,status:project.status,operator:project.operator,ownership:project.ownership,
    production_stage:project.stage,product:project.product,production:project.production,production_unit:project.productionUnit,
    production_period:project.productionPeriod,production_basis:project.productionBasis,guidance:project.guidance,
    capacity:project.capacity,reserve:project.reserve,source_url:sourceItem?.url ?? null,
  }]);

  return <main className="detail-terminal lithium-detail">
    <nav className="detail-nav"><Link href="/lithium">← 锂供给终端</Link><button type="button" onClick={exportProject}>导出项目 CSV</button></nav>
    <header className="detail-editorial">
      <div><span>LI / {project.country} / {project.status}</span><h1>{project.name}</h1><p>{project.stage} · {project.product}</p></div>
      <dl><div><dt>运营方</dt><dd>{project.operator}</dd></div><div><dt>权益结构</dt><dd>{project.ownership}</dd></div><div><dt>最新核验</dt><dd>2026-09-28</dd></div></dl>
    </header>
    <section className="detail-factline">
      <article><span>最新产量</span><strong>{project.production === null ? "待补" : `${project.production.toLocaleString()} ${project.productionUnit}`}</strong><p>{project.production === null ? "没有以产能替代实际产量" : `${project.productionPeriod} · ${project.productionBasis}`}</p>{project.production !== null && <button type="button" onClick={() => setSource(sourceItem ?? null)}>证据定位 ↗</button>}</article>
      <article><span>当前指引 / 目标</span><strong>{project.guidance ?? "待补"}</strong><p>{project.guidance ? "保持公司披露的原始产品与权益口径" : "尚无已核验公开指引"}</p>{project.guidance && <button type="button" onClick={() => setSource(sourceItem ?? null)}>证据定位 ↗</button>}</article>
      <article><span>名义产能</span><strong>{project.capacity}</strong><p>产能不作为实际产量，也不与其他锂产品直接相加。</p><button type="button" onClick={() => setSource(sourceItem ?? null)}>证据定位 ↗</button></article>
    </section>
    <section className="detail-columns">
      <article className="detail-reserve"><div className="detail-section-title"><span>01 / 储量与资源量</span><h2>矿体证据</h2></div>{project.reserve ? <><div className="reserve-numbers lithium-reserve"><div><strong>{project.reserve}</strong><span>公司技术披露原始口径</span></div></div><button type="button" onClick={() => setSource(sourceItem ?? null)}>查看技术材料 ↗</button></> : <div className="detail-missing-block"><b>待补</b><p>本批尚未录入可按相同分类比较的储量或资源量；未用第三方估算填充。</p></div>}</article>
      <article className="detail-ownership"><div className="detail-section-title"><span>02 / 运营与股权</span><h2>控制关系</h2></div><p className="operator-line">{project.operator}</p><div className="detail-missing-block"><b>{project.ownership}</b><p>展示公司披露的项目权益说明；生产事实另行标注项目 100% 或应占口径。</p></div><button type="button" onClick={() => setSource(sourceItem ?? null)}>查看股权来源 ↗</button></article>
    </section>
    {event && <section className="detail-event"><div className="detail-section-title"><span>03 / 重大事件</span><h2>{event.headline}</h2></div><div className="detail-event-layout"><div><time>{event.date}</time><p>{event.summary}</p></div><ol><li><b>{event.date}</b>{event.kind}</li></ol></div><div className="detail-source-tags"><button type="button" onClick={() => setSource(lithiumSourceById(event.sourceId) ?? null)}><span>A 级</span>{lithiumSourceById(event.sourceId)?.organization}</button></div></section>}
    <section className="detail-evidence"><div className="detail-section-title"><span>{event ? "04" : "03"} / 证据</span><h2>本项目来源材料</h2></div><div>{sourceItem && <button type="button" onClick={() => setSource(sourceItem)}><span>A</span><b>{sourceItem.title}</b><small>{sourceItem.organization} · {sourceItem.locator}</small></button>}</div></section>
    <PublicSourceDrawer source={source} onClose={() => setSource(null)} />
  </main>;
}
