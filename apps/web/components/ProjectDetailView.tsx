"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Observation, ProjectDetail } from "@/lib/types";
import { periodContext, periodHeading } from "@/lib/period-label";
import { ValueDisplay } from "./ValueDisplay";

const labels: Record<string, string> = { production: "实际产量", guidance: "年度指引", reserves: "储量与资源量", calendar_year: "自然年", fiscal_year: "公司财年", project_100: "项目 100%", equity: "权益口径", attributable: "应占口径", consolidated: "合并口径" };

type SourceDetail = {
  observation_id: string; kind: string; publisher: string; document_title: string;
  document_url: string; published_at: string | null; effective_date: string;
  fetched_at: string | null; source_tier: string | null; original_value: string | null;
  original_unit: string | null; normalized_value: string | null; normalized_unit: string;
  calendar_basis: string; fiscal_year_label: string | null;
  period: { start: string; end: string; type: string }; production_stage: string;
  ownership_basis: string; extraction_method: string; administrator_confirmed: boolean;
  confirmed_at: string | null; supersedes_id: string | null;
  evidence: { type: string; page_number: number | null; table_title: string | null; locator: Record<string, unknown>; quoted_excerpt: string | null };
};

function ObservationGroup({ title, items, onSource }: { title: string; items: Observation[]; onSource: (item: Observation) => void }) {
  return <section className="section"><h2>{title}</h2><div className="observation-list">{items.length ? items.map((item) => (
    <article className="observation" key={item.id}>
      <div><ValueDisplay value={item.value} unit={item.unit} missingReason={item.missing_reason} /><div className="meta">有效日 {item.effective_date}</div></div>
      <div data-period-type={item.period.type}><strong>{periodHeading(item.period, item.fiscal_year_label)}</strong><div className="meta">{periodContext(item.calendar_basis, item.period)}</div><div className="chips"><span className="chip">{labels[item.ownership_basis] ?? item.ownership_basis}</span><span className="chip">{item.production_stage}</span></div></div>
      <div><button className="button secondary" type="button" onClick={() => onSource(item)}>查看来源</button>{item.source.is_demo && <span className="demo">DEMO</span>}<div className="meta">{item.source.organization_name}<br />发布 {item.source.published_at ?? "待补"} · 核验 {item.source.verified_at ?? "待补"}</div></div>
    </article>
  )) : <div className="empty panel">待补：尚无已发布记录</div>}</div></section>;
}

export function ProjectDetailView({ slug }: { slug: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  const [sourceDetail, setSourceDetail] = useState<SourceDetail | null>(null);
  const [sourceError, setSourceError] = useState("");
  useEffect(() => { apiFetch<ProjectDetail>(`/api/v1/public/projects/${slug}`).then(setProject).catch((reason) => setError(reason.message)); }, [slug]);
  if (error) return <main className="page"><Link className="back" href="/">← 返回项目目录</Link><div className="empty error">{error}</div></main>;
  if (!project) return <main className="page"><div className="empty">正在读取项目数据…</div></main>;
  async function openSource(item: Observation) {
    setSourceError("");
    try { setSourceDetail(await apiFetch<SourceDetail>(`/api/v1/public/observations/${item.kind}/${item.id}/source`)); }
    catch (reason) { setSourceError(reason instanceof Error ? reason.message : "来源加载失败"); }
  }
  return <main className="page">
    <Link className="back" href="/">← 返回项目目录</Link>
    <section className="detail-header"><div><div className="eyebrow">Cu / {project.country.name_zh}</div><h1>{project.name}</h1><p className="lede">{project.operator ?? "运营方待补"} · {project.status} · {project.raw_material_route ?? "原料路线待补"}</p></div><div className="ownership">{project.ownership[0] ? <><strong>{project.ownership[0].ownership_pct}%</strong><span>{project.ownership[0].company} · 当前登记权益</span></> : <><strong>待补</strong><span>项目所有权</span></>}</div></section>
    {[...project.production, ...project.guidance, ...project.reserves].some((item) => item.source.is_demo) && <div className="notice"><strong>演示数据：</strong>本页包含 `demo_fixture`，用于验证流程，数值等待人工对照官方材料。</div>}
    <ObservationGroup title="实际产量" items={project.production} onSource={openSource} />
    <ObservationGroup title="年度指引" items={project.guidance} onSource={openSource} />
    <ObservationGroup title="储量与资源量" items={project.reserves} onSource={openSource} />
    {sourceError && <div className="notice error">{sourceError}</div>}
    {sourceDetail && <div className="source-drawer-backdrop" role="presentation" onClick={() => setSourceDetail(null)}><aside className="source-drawer" role="dialog" aria-modal="true" aria-label="数据来源" onClick={(event) => event.stopPropagation()}>
      <div className="source-drawer-head"><div><div className="eyebrow">SOURCE EVIDENCE</div><h2>{sourceDetail.document_title}</h2><div className="meta">{sourceDetail.publisher}</div></div><button className="button secondary" onClick={() => setSourceDetail(null)}>关闭</button></div>
      <dl className="source-detail-grid">
        <dt>原始值</dt><dd>{sourceDetail.original_value ?? "NULL"} {sourceDetail.original_unit ?? ""}</dd>
        <dt>标准化值</dt><dd>{sourceDetail.normalized_value ?? "NULL"} {sourceDetail.normalized_unit}</dd>
        <dt>数据有效日期</dt><dd>{sourceDetail.effective_date}</dd>
        <dt>期间</dt><dd data-period-type={sourceDetail.period.type}><strong>{periodHeading(sourceDetail.period, sourceDetail.fiscal_year_label)}</strong><br />{periodContext(sourceDetail.calendar_basis, sourceDetail.period)}</dd>
        <dt>生产环节</dt><dd>{sourceDetail.production_stage}</dd>
        <dt>所有权口径</dt><dd>{labels[sourceDetail.ownership_basis] ?? sourceDetail.ownership_basis}</dd>
        <dt>来源等级</dt><dd>{sourceDetail.source_tier ?? "未分级"}</dd>
        <dt>文档发布日期</dt><dd>{sourceDetail.published_at ?? "待补"}</dd>
        <dt>获取时间</dt><dd>{sourceDetail.fetched_at ? new Date(sourceDetail.fetched_at).toLocaleString("zh-CN") : "—"}</dd>
        <dt>证据定位</dt><dd>{sourceDetail.evidence.page_number ? `PDF 第 ${sourceDetail.evidence.page_number} 页` : JSON.stringify(sourceDetail.evidence.locator)}{sourceDetail.evidence.table_title ? ` · ${sourceDetail.evidence.table_title}` : ""}</dd>
        <dt>原文摘录</dt><dd>{sourceDetail.evidence.quoted_excerpt ?? "未提供结构化摘录"}</dd>
        <dt>提取方式</dt><dd>{sourceDetail.extraction_method}</dd>
        <dt>管理员确认</dt><dd>{sourceDetail.administrator_confirmed ? `已确认${sourceDetail.confirmed_at ? ` · ${new Date(sourceDetail.confirmed_at).toLocaleString("zh-CN")}` : ""}` : "否"}</dd>
        <dt>修订关系</dt><dd>{sourceDetail.supersedes_id ? `修订自 ${sourceDetail.supersedes_id}` : "初始版本"}</dd>
      </dl>
      <div className="actions section"><a className="button copper" href={sourceDetail.document_url} target="_blank" rel="noopener noreferrer">打开官方文件 ↗</a></div>
    </aside></div>}
  </main>;
}
