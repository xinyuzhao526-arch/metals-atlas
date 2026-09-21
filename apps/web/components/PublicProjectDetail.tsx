"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProjectMap } from "@/components/ProjectMap";
import { PublicSourceDrawer } from "@/components/PublicSourceDrawer";
import { downloadCsv, formatMissing, projectBySlug, projectFacts, publicData, sourceById, type PublicSource } from "@/lib/public-data";

export function PublicProjectDetail({ slug }: { slug: string }) {
  const [source, setSource] = useState<PublicSource | null>(null);
  useEffect(() => {
    const sourceId = new URLSearchParams(window.location.search).get("source");
    if (sourceId) setSource(sourceById(sourceId) ?? null);
  }, []);
  const project = projectBySlug(slug);
  if (!project) return <main className="detail-terminal"><div className="detail-empty">项目不存在。</div></main>;
  const facts = projectFacts(project.id);
  const guidance = facts.guidance[0];
  const reserve = facts.reserves[0];
  const latestQuarter = facts.production.find((item) => item.period.type === "quarter");
  const annual = facts.production.find((item) => item.period.type === "annual");
  const event = facts.events[0];
  const evidenceIds = Array.from(new Set([
    project.profile_source_id,
    project.ownership_source_id,
    project.location.source_id,
    ...facts.production.map((item) => item.source_id),
    ...facts.guidance.map((item) => item.source_id),
    ...facts.reserves.map((item) => item.source_id),
    ...facts.events.flatMap((item) => item.source_ids),
  ].filter((item): item is string => Boolean(item))));
  const exportProject = () => downloadCsv(`metals-atlas-${project.slug}.csv`, [
    ...facts.production.map((item) => ({ project_id: project.id, project: project.name, fact_type: "production", period: item.period.label, value: item.value, unit: item.unit, missing_reason: item.missing_reason, effective_date: item.effective_date, production_stage: item.production_stage, ownership_basis: item.ownership_basis, source_id: item.source_id, source_url: sourceById(item.source_id)?.url ?? null })),
    ...facts.guidance.map((item) => ({ project_id: project.id, project: project.name, fact_type: "guidance", period: item.period.label, value: item.low === null ? null : `${item.low}-${item.high}`, unit: item.unit, missing_reason: item.missing_reason, effective_date: item.effective_date, production_stage: item.production_stage, ownership_basis: item.ownership_basis, source_id: item.source_id, source_url: sourceById(item.source_id)?.url ?? null })),
    ...facts.reserves.map((item) => ({ project_id: project.id, project: project.name, fact_type: "ore_reserve", period: item.effective_date, value: item.ore_tonnage, unit: item.ore_tonnage_unit, missing_reason: item.missing_reason, effective_date: item.effective_date, production_stage: item.production_stage, ownership_basis: item.ownership_basis, source_id: item.source_id, source_url: sourceById(item.source_id)?.url ?? null })),
  ]);

  return <main className="detail-terminal">
    <nav className="detail-nav"><Link href="/copper">← 铜供给终端</Link><div><button type="button" onClick={exportProject}>导出项目 CSV</button></div></nav>
    <header className="detail-editorial">
      <div><span>CU / {project.country.iso3} / {project.status.toUpperCase()}</span><h1>{project.name}</h1><p>{project.country.name_zh}{project.region ? ` · ${project.region}` : ""} · {project.operation_type}</p></div>
      <dl><div><dt>运营方</dt><dd>{project.operator ?? formatMissing(project.operator_missing_reason)}</dd>{project.operator_source_id && <button type="button" onClick={() => setSource(sourceById(project.operator_source_id) ?? null)}>来源 ↗</button>}</div><div><dt>最新核验</dt><dd>{project.verified_at}</dd></div><div><dt>坐标精度</dt><dd>{project.location.precision === "approximate" ? "近似矿区中心" : project.location.precision}</dd></div></dl>
    </header>

    <section className="detail-factline">
      <article><span>最新季度产量</span><strong>{latestQuarter?.value !== null && latestQuarter ? `${latestQuarter.value.toFixed(3)} ${latestQuarter.unit}` : "待补"}</strong><p>{latestQuarter ? `${latestQuarter.period.label} · ${latestQuarter.production_stage} · ${latestQuarter.ownership_basis}` : "尚无已核验季度观察"}</p>{latestQuarter && <button type="button" onClick={() => setSource(sourceById(latestQuarter.source_id) ?? null)}>证据定位 ↗</button>}</article>
      <article><span>年度累计 / 全年</span><strong>{annual?.value !== null && annual ? `${annual.value.toFixed(3)} ${annual.unit}` : "待补"}</strong><p>{annual ? `${annual.period.label} · 自然年` : "尚无已核验年度观察"}</p>{annual && <button type="button" onClick={() => setSource(sourceById(annual.source_id) ?? null)}>证据定位 ↗</button>}</article>
      <article><span>当前年度指引</span><strong>{guidance ? `${guidance.low}–${guidance.high} ${guidance.unit}` : "待补"}</strong><p>{guidance ? `${guidance.period.label} · ${guidance.guidance_kind === "maintained" ? "维持不变" : guidance.guidance_kind}` : "尚无已核验指引"}</p>{guidance && <button type="button" onClick={() => setSource(sourceById(guidance.source_id) ?? null)}>证据定位 ↗</button>}</article>
    </section>

    <section className="detail-columns">
      <article className="detail-reserve">
        <div className="detail-section-title"><span>01 / 储量</span><h2>矿体证据</h2></div>
        {reserve ? <>
          <div className="reserve-numbers"><div><strong>{reserve.ore_tonnage}</strong><span>{reserve.ore_tonnage_unit} ore</span></div><div><strong>{reserve.grade_pct}%</strong><span>Cu grade</span></div><div className="reserve-missing"><strong>{formatMissing(reserve.missing_reason)}</strong><span>contained metal · 不自行计算</span></div></div>
          <dl><div><dt>分类</dt><dd>Proved + Probable</dd></div><div><dt>有效日期</dt><dd>{reserve.effective_date}</dd></div><div><dt>口径</dt><dd>项目 100%</dd></div></dl>
          <button type="button" onClick={() => setSource(sourceById(reserve.source_id) ?? null)}>查看储量原文定位 ↗</button>
        </> : <div className="detail-missing-block"><b>待补</b><p>该项目尚无已核验储量观察；未以第三方估算填充。</p></div>}
      </article>
      <article className="detail-ownership">
        <div className="detail-section-title"><span>02 / 运营与股权</span><h2>控制关系</h2></div>
        <p className="operator-line">{project.operator ?? formatMissing(project.operator_missing_reason)}</p>
        {project.ownership.length ? <><div className="ownership-band">{project.ownership.map((item, index) => <i key={item.company} style={{ width: `${item.ownership_pct}%` }} data-index={index} />)}</div><div className="ownership-rows">{project.ownership.map((item, index) => <div key={item.company}><i data-index={index} /><span>{item.company}</span><b>{item.ownership_pct}%</b></div>)}</div></> : <div className="detail-missing-block"><b>待补</b><p>股权口径尚未进入公开静态事实层。</p></div>}
        {project.ownership_source_id && <button type="button" onClick={() => setSource(sourceById(project.ownership_source_id) ?? null)}>查看股权来源 ↗</button>}
      </article>
    </section>

    {event && <section className="detail-event">
      <div className="detail-section-title"><span>03 / 重大事件</span><h2>{event.headline_zh}</h2></div>
      <div className="detail-event-layout"><div><time>{event.event_start_date} → {event.operations_resumed_date}</time><p>{event.summary_zh}</p></div><ol><li><b>{event.event_start_date}</b>事故</li><li><b>{event.operations_suspended_date}</b>临时停产</li><li><b>{event.operations_resumed_date}</b>矿山与选矿厂复产</li></ol></div>
      <div className="detail-source-tags">{event.source_ids.map((id) => { const item = sourceById(id); return item ? <button key={id} type="button" onClick={() => setSource(item)}><span>{item.tier} 级</span>{item.organization}</button> : null; })}</div>
    </section>}

    <section className="detail-location">
      <div><div className="detail-section-title"><span>{event ? "04" : "03"} / 位置</span><h2>矿区定位</h2></div><ProjectMap projects={[project]} selectedProjectId={project.id} eventProjectIds={event ? [project.id] : []} onSelect={() => undefined} /></div>
      <aside><b>{project.location.precision === "approximate" ? "近似定位" : project.location.precision}</b><p>{project.location.basis ?? "定位依据待补"}</p><dl><div><dt>纬度</dt><dd>{project.location.latitude ?? "待补"}</dd></div><div><dt>经度</dt><dd>{project.location.longitude ?? "待补"}</dd></div></dl>{project.location.source_id && <button type="button" onClick={() => setSource(sourceById(project.location.source_id) ?? null)}>地理来源与方法 ↗</button>}</aside>
    </section>

    <section className="detail-evidence">
      <div className="detail-section-title"><span>{event ? "05" : "04"} / 证据</span><h2>本项目资料标签</h2></div>
      {evidenceIds.length ? <div>{evidenceIds.map((id) => { const item = sourceById(id); return item ? <button key={id} type="button" onClick={() => setSource(item)}><span>{item.tier}</span><b>{item.title}</b><small>{item.organization} · {item.locator}</small></button> : null; })}</div> : <div className="detail-missing-block"><b>来源待核验</b><p>只有项目主数据和近似位置，尚无生产、指引或储量证据。</p></div>}
    </section>
    <PublicSourceDrawer source={source} onClose={() => setSource(null)} />
  </main>;
}
