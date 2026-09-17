"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Observation, ProjectDetail } from "@/lib/types";
import { ValueDisplay } from "./ValueDisplay";

const labels: Record<string, string> = { production: "实际产量", guidance: "年度指引", reserves: "储量与资源量", calendar_year: "自然年", fiscal_year: "公司财年", project_100: "项目 100%", equity: "权益口径", attributable: "应占口径", consolidated: "合并口径" };

function ObservationGroup({ title, items }: { title: string; items: Observation[] }) {
  return <section className="section"><h2>{title}</h2><div className="observation-list">{items.length ? items.map((item) => (
    <article className="observation" key={item.id}>
      <div><ValueDisplay value={item.value} unit={item.unit} missingReason={item.missing_reason} /><div className="meta">有效日 {item.effective_date}</div></div>
      <div><strong>{labels[item.calendar_basis] ?? item.calendar_basis}{item.fiscal_year_label ? ` · ${item.fiscal_year_label}` : ""}</strong><div className="meta">{item.period.start} — {item.period.end} · {item.period.type}</div><div className="chips"><span className="chip">{labels[item.ownership_basis] ?? item.ownership_basis}</span><span className="chip">{item.production_stage}</span></div></div>
      <div><a className="source-link" href={item.source.material_url} target="_blank" rel="noreferrer">{item.source.material_title} ↗</a>{item.source.is_demo && <span className="demo">DEMO</span>}<div className="meta">{item.source.organization_name}<br />发布 {item.source.published_at} · 核验 {item.source.verified_at}</div></div>
    </article>
  )) : <div className="empty panel">待补：尚无已发布记录</div>}</div></section>;
}

export function ProjectDetailView({ slug }: { slug: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<ProjectDetail>(`/api/v1/public/projects/${slug}`).then(setProject).catch((reason) => setError(reason.message)); }, [slug]);
  if (error) return <main className="page"><Link className="back" href="/">← 返回项目目录</Link><div className="empty error">{error}</div></main>;
  if (!project) return <main className="page"><div className="empty">正在读取项目数据…</div></main>;
  return <main className="page">
    <Link className="back" href="/">← 返回项目目录</Link>
    <section className="detail-header"><div><div className="eyebrow">Cu / {project.country.name_zh}</div><h1>{project.name}</h1><p className="lede">{project.operator ?? "运营方待补"} · {project.status} · {project.raw_material_route ?? "原料路线待补"}</p></div><div className="ownership">{project.ownership[0] ? <><strong>{project.ownership[0].ownership_pct}%</strong><span>{project.ownership[0].company} · 当前登记权益</span></> : <><strong>待补</strong><span>项目所有权</span></>}</div></section>
    {[...project.production, ...project.guidance, ...project.reserves].some((item) => item.source.is_demo) && <div className="notice"><strong>演示数据：</strong>本页包含 `demo_fixture`，用于验证流程，数值等待人工对照官方材料。</div>}
    <ObservationGroup title="实际产量" items={project.production} />
    <ObservationGroup title="年度指引" items={project.guidance} />
    <ObservationGroup title="储量与资源量" items={project.reserves} />
  </main>;
}

