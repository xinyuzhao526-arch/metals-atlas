"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminSession } from "@/components/AdminLayout";
import { apiFetch } from "@/lib/api";
import type { AdminObservation, AdminProjectDetail as Detail } from "@/lib/admin-projects";


function ObservationTable({ title, items }: { title: string; items: AdminObservation[] }) {
  return <section className="section panel">
    <div className="panel-head"><h2>{title}</h2><span className="count">{items.length} 条</span></div>
    {items.length ? <div className="table-wrap"><table>
      <thead><tr><th>稳定键</th><th>数值</th><th>期间/口径</th><th>来源</th><th>审核/发布</th><th>原始字段</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td>{item.record_key}</td>
        <td>{item.normalized_value ?? "NULL"} {item.normalized_unit}<div className="meta">{item.missing_reason ?? "无缺失原因"}</div></td>
        <td>{String(item.period_start)} — {String(item.period_end)}<div className="meta">{String(item.ownership_basis)} · {String(item.production_stage)}</div></td>
        <td><a className="source-link" href={item.source.material_url} target="_blank" rel="noreferrer">{item.source.code} ↗</a><div className="meta">{item.source.organization_name}</div></td>
        <td>{item.review_status}<div className="meta">{item.published ? "已发布" : "未发布"}</div></td>
        <td><details><summary>查看 JSON</summary><pre>{JSON.stringify(item, null, 2)}</pre></details></td>
      </tr>)}</tbody>
    </table></div> : <div className="empty">暂无{title}记录。</div>}
  </section>;
}


export function AdminProjectDetail({ projectRef }: { projectRef: string }) {
  const { handleAdminFailure } = useAdminSession();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<Detail>(`/api/v1/admin/projects/${encodeURIComponent(projectRef)}`)
      .then(setDetail)
      .catch((reason) => {
        if (!handleAdminFailure(reason)) setError(reason instanceof Error ? reason.message : "项目详情加载失败");
      });
  }, [handleAdminFailure, projectRef]);
  if (error) return <main className="page"><Link className="back" href="/admin/projects">← 返回管理项目目录</Link><div className="empty error">{error}</div></main>;
  if (!detail) return <main className="page"><div className="empty">正在读取项目主数据…</div></main>;
  const project = detail.project;
  return <main className="page">
    <Link className="back" href="/admin/projects">← 返回管理项目目录</Link>
    <section className="detail-header"><div><div className="eyebrow">{project.country.iso3} · {project.country.name_zh}</div><h1>{project.name}</h1><p className="lede">{project.slug} · {project.operator?.canonical_name ?? "运营方待补"} · {project.status}</p></div><div className="ownership"><strong>{project.observation_count}</strong><span>全部观察记录</span></div></section>
    <div className="chips">{project.completeness.map((item) => <span className="chip" key={item.code}>{item.label}</span>)}</div>

    <section className="section panel"><div className="panel-head"><h2>项目主数据</h2><span className="count">只读</span></div><dl className="detail-grid">
      <div><dt>项目 ID</dt><dd>{project.id}</dd></div><div><dt>slug</dt><dd>{project.slug}</dd></div>
      <div><dt>国家</dt><dd>{project.country.iso3} · {project.country.name_zh}</dd></div><div><dt>运营方</dt><dd>{project.operator?.canonical_name ?? "待补"}</dd></div>
      <div><dt>状态</dt><dd>{project.status}</dd></div><div><dt>原料路线</dt><dd>{project.raw_material_route ?? "待补"}</dd></div>
      <div><dt>经纬度</dt><dd>{project.latitude ?? "—"}, {project.longitude ?? "—"}</dd></div><div><dt>创建/更新</dt><dd>{new Date(project.created_at).toLocaleString("zh-CN")}<br />{new Date(project.updated_at).toLocaleString("zh-CN")}</dd></div>
    </dl></section>

    <section className="section panel"><div className="panel-head"><h2>所有权</h2><span className="count">{detail.ownership.length} 条</span></div>{detail.ownership.length ? <div className="table-wrap"><table><thead><tr><th>公司</th><th>持股比例</th><th>有效期</th></tr></thead><tbody>{detail.ownership.map((item) => <tr key={item.id}><td>{item.company.canonical_name}</td><td>{item.ownership_pct}%</td><td>{item.valid_from} — {item.valid_to ?? "持续有效"}</td></tr>)}</tbody></table></div> : <div className="empty">暂无公司/持股记录。</div>}</section>
    <section className="section panel"><div className="panel-head"><h2>来源材料</h2><span className="count">{detail.sources.length} 条</span></div>{detail.sources.length ? <div className="table-wrap"><table><thead><tr><th>source_code</th><th>机构/材料</th><th>发布/核验</th></tr></thead><tbody>{detail.sources.map((source) => <tr key={source.id}><td>{source.code}</td><td><a className="source-link" href={source.material_url} target="_blank" rel="noreferrer">{source.material_title} ↗</a><div className="meta">{source.organization_name}</div></td><td>{source.published_at}<div className="meta">核验 {source.verified_at}</div></td></tr>)}</tbody></table></div> : <div className="empty">暂无来源材料。</div>}</section>
    <ObservationTable title="产量" items={detail.observations.production} />
    <ObservationTable title="指引" items={detail.observations.guidance} />
    <ObservationTable title="储量" items={detail.observations.reserves} />
    <section className="section panel"><div className="panel-head"><h2>缺失字段及原因</h2></div><div className="form"><div><strong>项目字段：</strong> {detail.missing.project_fields.join("、") || "无"}</div>{detail.missing.observations.length ? <ul>{detail.missing.observations.map((item) => <li key={`${item.kind}-${item.record_key}`}>{item.kind} / {item.record_key} / {item.field}：{item.reason ?? "未提供原因"}</li>)}</ul> : <div className="meta">观察记录没有数值缺失项。</div>}</div></section>
  </main>;
}
