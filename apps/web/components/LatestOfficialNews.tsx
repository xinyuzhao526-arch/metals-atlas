import newsJson from "@/data/news.json";

type NewsItem = {
  id: string; metal_id: "metal-cu" | "metal-li" | "metal-ni" | "metal-al"; title: string; organization: string;
  material_url: string; publication_date: string; verification_date: string; source_level?: "media"; event_tag?: string;
};

export function LatestOfficialNews({ metal }: { metal: "cu" | "li" | "ni" | "al" }) {
  const metalId = `metal-${metal}`;
  const items = (newsJson.items as NewsItem[]).filter((item) => item.metal_id === metalId).slice(0, 6);
  return <section className="official-news">
    <div className="section-heading"><div><span>DAILY / 供给动态</span><h2>每日供给新闻监测</h2></div><p>公开媒体快讯用于发现；公司材料用于官方核验</p></div>
    {items.length ? <div className="official-news-grid">{items.map((item) => <a key={item.id} href={item.material_url} target="_blank" rel="noopener noreferrer"><time>{item.publication_date}{item.event_tag ? ` · ${item.event_tag}` : ""}</time><h3>{item.title}</h3><p>{item.organization}</p><span>{item.source_level === "media" ? "媒体快讯 · 待官方回溯 ↗" : "A 级官方材料 ↗"}</span></a>)}</div> : <div className="official-news-empty"><b>暂无新的供给动态</b><span>每日监测公开矿业媒体 RSS 与矿企正式公告。</span></div>}
    <p className="official-news-note">监控范围：停复产、事故、扩建投产、并购股权、长协包销及政策监管。媒体条目不等同于已核验事实。最近内容更新：{newsJson.updated_at}。</p>
  </section>;
}
