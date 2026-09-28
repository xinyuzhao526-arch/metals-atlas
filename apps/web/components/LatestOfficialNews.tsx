import newsJson from "@/data/news.json";

type NewsItem = {
  id: string; metal_id: "metal-cu" | "metal-li"; title: string; organization: string;
  material_url: string; publication_date: string; verification_date: string;
};

export function LatestOfficialNews({ metal }: { metal: "cu" | "li" }) {
  const metalId = metal === "cu" ? "metal-cu" : "metal-li";
  const items = (newsJson.items as NewsItem[]).filter((item) => item.metal_id === metalId).slice(0, 6);
  return <section className="official-news">
    <div className="section-heading"><div><span>DAILY / 官方动态</span><h2>每日供给新闻监测</h2></div><p>每日检查；只有发现新的官方材料才更新发布</p></div>
    {items.length ? <div className="official-news-grid">{items.map((item) => <a key={item.id} href={item.material_url} target="_blank" rel="noopener noreferrer"><time>{item.publication_date}</time><h3>{item.title}</h3><p>{item.organization}</p><span>A 级原始材料 ↗</span></a>)}</div> : <div className="official-news-empty"><b>暂无新的官方供给动态</b><span>监控已启用；不会用媒体转载或旧链接填充。</span></div>}
    <p className="official-news-note">监控范围：产量、指引、停复产、事故、扩建、许可、季度/年度业绩及资源储量。最近内容更新：{newsJson.updated_at}。</p>
  </section>;
}
