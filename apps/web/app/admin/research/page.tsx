import { ResearchConsole } from "@/components/ResearchConsole";

export default function ResearchPage() {
  return <main className="page">
    <section className="hero">
      <div>
        <div className="eyebrow">PHASE 1B.1 · SOURCE RESEARCH</div>
        <h1>资料研究</h1>
        <p className="lede">保存官方材料、定位证据并生成候选；管理员一次确认后才会公开。</p>
      </div>
      <div className="metal-tag">01B</div>
    </section>
    <ResearchConsole />
  </main>;
}
