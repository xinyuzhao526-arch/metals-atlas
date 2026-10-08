import Link from "next/link";

export default function HomePage() {
  return <main className="metal-hub">
    <header className="metal-hub-hero">
      <div><span>METALS ATLAS / 研究公开版</span><h1>一个入口，<br />阅读三种金属。</h1></div>
      <p>铜、锂、镍现已归入同一套供给研究终端。选择金属后，可查看项目地图、生产数据、供给事件、官方新闻、来源证据和项目详情。</p>
    </header>
    <section className="metal-hub-grid" aria-label="选择金属研究终端">
      <Link href="/copper" className="metal-hub-card copper"><span className="metal-hub-symbol">Cu</span><div><small>01 / COPPER</small><h2>铜</h2><p>全球铜矿项目、产量、库存与重大供给事件。</p><dl><div><dt>项目</dt><dd>46</dd></div><div><dt>功能</dt><dd>地图 · 库存 · 事件</dd></div></dl></div><b>进入铜页面 →</b></Link>
      <Link href="/lithium" className="metal-hub-card lithium"><span className="metal-hub-symbol">Li</span><div><small>02 / LITHIUM</small><h2>锂</h2><p>锂辉石、盐湖与化学品端的分阶段供给研究。</p><dl><div><dt>项目</dt><dd>8</dd></div><div><dt>功能</dt><dd>地图 · 指引 · 事件</dd></div></dl></div><b>进入锂页面 →</b></Link>
      <Link href="/nickel" className="metal-hub-card nickel"><span className="metal-hub-symbol">Ni</span><div><small>03 / NICKEL</small><h2>镍</h2><p>红土镍、硫化镍及不同中间产品的供给研究。</p><dl><div><dt>项目</dt><dd>8</dd></div><div><dt>功能</dt><dd>地图 · 状态 · 事件</dd></div></dl></div><b>进入镍页面 →</b></Link>
    </section>
    <section className="metal-hub-method"><div><span>统一标准</span><h2>三种金属，共用同一套数据边界。</h2></div><ul><li>缺失数据保持 null，不转换为零</li><li>季度、年度、YTD 与长期目标分别标注</li><li>项目 100% 与公司应占口径明确区分</li><li>每项事实连接至具体官方来源材料</li></ul></section>
  </main>;
}
