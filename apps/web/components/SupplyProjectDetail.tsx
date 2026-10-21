"use client";
import Link from "next/link";
import { useState } from "react";
import { AnnualProductionBlock, FactBlock } from "@/components/SupplyFactDisplay";
import { PublicSourceDrawer } from "@/components/PublicSourceDrawer";
import { downloadCsv, type PublicSource } from "@/lib/public-data";
import { assetFacts, exportFacts, latestFact, type SupplyConfig } from "@/lib/tin-iron-data";
const metricNames={production:"生产",shipments:"发运",guidance:"指引 / 目标",reserve:"储量",resource:"资源量"};
export function SupplyProjectDetail({config:c,projectId}:{config:SupplyConfig;projectId:string}) {
  const [source,setSource]=useState<PublicSource|null>(null);
  const p=c.projects.find(p=>p.id===projectId)!;
  const open=(id:string)=>setSource(c.sources.find(s=>s.id===id)??null);
  const rows=c.facts.filter(f=>f.project_id===p.id).sort((a,b)=>b.period.end.localeCompare(a.period.end));
  const events=c.events.filter(e=>e.projectId===p.id).sort((a,b)=>b.date.localeCompare(a.date));
  const sourceIds=new Set([p.profile_source_id,...rows.map(f=>f.source_id),...events.map(e=>e.sourceId)]);
  const material=c.sources.filter(s=>sourceIds.has(s.id));
  return <main className={"detail-terminal supply-detail "+c.slug+"-terminal"}>
    <nav className="detail-nav"><Link href={"/"+c.slug}>← {c.name}供给终端</Link><button type="button" onClick={()=>downloadCsv("metals-atlas-"+c.slug+"-"+p.id+".csv",exportFacts(c,[p.id]))}>导出项目 CSV</button></nav>
    <header className="detail-editorial"><div><span>{c.symbol.toUpperCase()} / {p.country} / 披露时运营中</span><h1>{p.name}</h1><p>{p.stage} · {p.product}</p></div><dl><div><dt>运营方</dt><dd>{p.operator}</dd></div><div><dt>档案基准日</dt><dd>{p.profile_as_of}</dd></div><div><dt>资料核验</dt><dd>{c.updated}</dd></div></dl></header>
    <p className="supply-detail-summary">{p.summary}</p>
    <section className="detail-factline"><article><span>已录入季度产量</span><FactBlock fact={latestFact(c,p.id,"production","quarter")} onSource={open}/></article><article><span>全年 / 年度累计</span><AnnualProductionBlock config={c} projectId={p.id} onSource={open}/></article><article><span>指引 / 目标</span><FactBlock fact={latestFact(c,p.id,"guidance")} onSource={open}/></article></section>
    <section className="supply-detail-history"><div className="section-heading"><div><span>01 / 观察记录</span><h2>生产、发运与目标逐项保留</h2></div><p>每项记录有独立期间、口径与来源</p></div><div className="matrix-table-wrap"><table className="research-matrix"><thead><tr><th>指标</th><th>数值 / 期间 / 权益</th><th>生产阶段</th><th>生效日</th><th>材料发布 / 核验</th><th>证据与说明</th></tr></thead><tbody>{rows.filter(f=>f.metric!=="reserve"&&f.metric!=="resource").map(f=><tr key={f.record_key}><td><b>{metricNames[f.metric]}</b></td><td><FactBlock fact={f} onSource={open}/></td><td>{f.production_stage}</td><td>{f.effective_date}</td><td>{f.source_publication_date}<small>核验 {f.verification_date}</small></td><td><p>{f.note||"原始报告披露"}</p><button type="button" className="evidence-link" onClick={()=>open(f.source_id)}>原文定位 ↗</button></td></tr>)}</tbody></table></div></section>
    <section className="detail-columns"><article className="detail-reserve"><div className="detail-section-title"><span>02 / 储量与资源量</span><h2>矿体证据</h2></div><FactBlock fact={latestFact(c,p.id,"reserve")} onSource={open}/><p>储量与资源量不互换，原矿吨与可销售产品吨不互换。基准日保留在记录中。</p>{assetFacts(c,p.id,"resource").map(f=><FactBlock key={f.record_key} fact={f} onSource={open}/>)}</article><article className="detail-ownership"><div className="detail-section-title"><span>03 / 运营与权益</span><h2>谁运营，如何读数</h2></div><p className="operator-line">{p.operator}</p><div className="detail-missing-block"><b>{p.ownership}</b><p>以上为披露时口径；产量权益逐项标明，不按持股比例自行反推或折算。</p><button className="evidence-link" type="button" onClick={()=>open(p.profile_source_id)}>档案来源 ↗</button></div><p>{p.region} · 地图是按报告所述区域人工标注的近似中心，不代表设施边界。</p></article></section>
    <section className="supply-detail-events"><div className="section-heading"><div><span>04 / 供给事件</span><h2>已核验的项目动态</h2></div></div>{events.length?events.map(e=><article key={e.id}><time>{e.date} · {e.kind}</time><h3>{e.headline}</h3><p>{e.summary}</p><button className="evidence-link" type="button" onClick={()=>open(e.sourceId)}>事件来源 ↗</button></article>):<div className="detail-missing-block">待补 / 本批未录入该项目事件</div>}</section>
    <section className="detail-evidence"><div className="detail-section-title"><span>05 / 来源证据</span><h2>本项目的原始材料</h2></div><div>{material.map(s=><button key={s.id} type="button" onClick={()=>setSource(s)}><span>{s.tier}</span><b>{s.title}</b><small>{s.organization} · 发布 {s.publication_date} · 核验 {s.verification_date}</small></button>)}</div></section>
    <PublicSourceDrawer source={source} onClose={()=>setSource(null)}/>
  </main>;
}
