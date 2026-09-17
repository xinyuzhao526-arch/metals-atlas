import { ProjectExplorer } from "@/components/ProjectExplorer";

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <div><div className="eyebrow">全球金属 · 实物供给</div><h1>铜项目数据追踪</h1><p className="lede">每条公开记录都经过人工审核，并明确保留期间、生产环节、所有权口径和具体来源材料。</p></div>
        <div className="metal-tag">Cu</div>
      </section>
      <div className="notice">Phase 1A：当前仅展示已“接受并发布”的记录。演示来源会明确标记，不代表真实生产数据。</div>
      <ProjectExplorer />
    </main>
  );
}

