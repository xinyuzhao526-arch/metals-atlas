"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminSession } from "@/components/AdminLayout";
import { apiFetch } from "@/lib/api";
import { AdminProjectList, adminProjectsQuery } from "@/lib/admin-projects";


function dateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN");
}


export function AdminProjectsDirectory() {
  const { handleAdminFailure } = useAdminSession();
  const [data, setData] = useState<AdminProjectList | null>(null);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState("");
  const [completeness, setCompleteness] = useState("");
  const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const pageSize = 25;

  useEffect(() => {
    const query = adminProjectsQuery({ q, country, status, completeness, sort, page, pageSize });
    setError("");
    apiFetch<AdminProjectList>(`/api/v1/admin/projects?${query}`)
      .then(setData)
      .catch((reason) => {
        if (!handleAdminFailure(reason)) setError(reason instanceof Error ? reason.message : "项目目录加载失败");
      });
  }, [completeness, country, handleAdminFailure, page, q, sort, status]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  return (
    <>
      <div className="admin-project-filters">
        <label>项目名称或 slug
          <input className="input" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="例如 Spence / spence" />
        </label>
        <label>国家
          <select className="select" value={country} onChange={(event) => { setCountry(event.target.value); setPage(1); }}>
            <option value="">全部国家</option>
            {data?.filters.countries.map((item) => <option key={item.iso3} value={item.iso3}>{item.iso3} · {item.name_zh}</option>)}
          </select>
        </label>
        <label>项目状态
          <select className="select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">全部状态</option>
            {data?.filters.statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>数据完整度
          <select className="select" value={completeness} onChange={(event) => { setCompleteness(event.target.value); setPage(1); }}>
            <option value="">全部完整度</option>
            {data?.filters.completeness.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>
        <label>排序
          <select className="select" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
            <option value="created_desc">创建时间（新到旧）</option>
            <option value="created_asc">创建时间（旧到新）</option>
            <option value="name_asc">项目名（A–Z）</option>
            <option value="name_desc">项目名（Z–A）</option>
          </select>
        </label>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><h2>全部项目主数据</h2><span className="count">包括尚无任何已发布观察记录的项目</span></div>
          <span className="count">{data?.total ?? 0} 个项目</span>
        </div>
        {error ? <div className="empty error">{error}</div> : (
          <div className="table-wrap admin-project-table">
            <table>
              <thead><tr><th>项目</th><th>国家</th><th>运营方/状态</th><th>路线/坐标</th><th>观察记录</th><th>数据完整度</th><th>创建/更新</th></tr></thead>
              <tbody>
                {data?.items.map((project) => (
                  <tr key={project.id}>
                    <td><Link className="source-link" href={`/admin/projects/${project.slug}`}>{project.name}</Link><div className="meta">{project.slug}</div></td>
                    <td><strong>{project.country.iso3}</strong><div className="meta">{project.country.name_zh}</div></td>
                    <td>{project.operator?.canonical_name ?? "待补"}<div className="meta">{project.status}</div></td>
                    <td>{project.raw_material_route ?? "待补"}<div className="meta">{project.latitude ?? "—"}, {project.longitude ?? "—"}</div></td>
                    <td>共 {project.observation_count}<div className="meta">待审核 {project.pending_observation_count} · 已发布 {project.published_observation_count}</div></td>
                    <td><div className="chips compact">{project.completeness.map((item) => <span className="chip" key={item.code}>{item.label}</span>)}</div></td>
                    <td>{dateTime(project.created_at)}<div className="meta">更新 {dateTime(project.updated_at)}</div></td>
                  </tr>
                ))}
                {data && !data.items.length && <tr><td colSpan={7} className="empty">没有符合筛选条件的项目。</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <button className="button secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button className="button secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button>
        </div>
      </section>
    </>
  );
}
