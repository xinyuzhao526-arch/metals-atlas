import { AdminProjectsDirectory } from "@/components/AdminProjectsDirectory";


export default function AdminProjectsPage() {
  return <main className="page">
    <section className="hero"><div><div className="eyebrow">PHASE 1A · ADMIN PROJECT CATALOG</div><h1>项目主数据目录</h1><p className="lede">查看全部项目，包括尚未进入公开项目列表的主数据记录。</p></div><div className="metal-tag">ALL</div></section>
    <AdminProjectsDirectory />
  </main>;
}
