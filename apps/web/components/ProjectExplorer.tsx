"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";

const stageNames: Record<string, string> = {
  mine_contained_metal: "矿端含金属量",
  concentrate_contained_metal: "精矿含金属量",
  cathode: "阴极",
  anode_blister: "阳极/粗铜",
  smelter_output: "冶炼产出",
};

export function ProjectExplorer() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<ProjectSummary[]>("/api/v1/public/projects").then(setProjects).catch((reason) => setError(reason.message));
  }, []);

  const countries = useMemo(() => Array.from(new Map(projects.map((project) => [project.country.iso3, project.country])).values()), [projects]);
  const filtered = projects.filter((project) => {
    const text = `${project.name} ${project.country.name_zh} ${project.country.name_en}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!country || project.country.iso3 === country) && (!stage || project.production_stages.includes(stage));
  });

  return (
    <>
      <div className="toolbar">
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、国家" aria-label="搜索项目、国家" />
        <select className="select" value={country} onChange={(event) => setCountry(event.target.value)} aria-label="国家筛选">
          <option value="">全部国家</option>{countries.map((item) => <option key={item.iso3} value={item.iso3}>{item.name_zh}</option>)}
        </select>
        <select className="select" value={stage} onChange={(event) => setStage(event.target.value)} aria-label="生产环节筛选">
          <option value="">全部生产环节</option>{Object.entries(stageNames).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </div>
      <section className="panel">
        <div className="panel-head"><h2>铜项目目录</h2><span className="count">{filtered.length} 个已发布项目</span></div>
        {error ? <div className="empty error">无法读取项目：{error}</div> : filtered.length ? (
          <div className="project-grid">{filtered.map((project, index) => (
            <Link className="project-card" key={project.slug} href={`/projects/${project.slug}`}>
              <span className="project-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="project-title"><strong>{project.name}</strong><span className="arrow">查看详情 ↗</span></div>
              <div className="meta">{project.country.name_zh} · {project.status}</div>
              <div className="chips">{project.production_stages.map((item) => <span className="chip" key={item}>{stageNames[item] ?? item}</span>)}</div>
            </Link>
          ))}</div>
        ) : <div className="empty">暂无符合条件的已发布项目。Excel 导入后仍须执行“接受并发布”。</div>}
      </section>
    </>
  );
}

