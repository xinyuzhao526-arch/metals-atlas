import Link from "next/link";
const metals=[
 {href:"/copper",cls:"copper",symbol:"Cu",name:"铜",en:"COPPER",desc:"全球铜矿项目、产量、库存与重大供给事件。",count:"46",features:"地图 · 库存 · 事件"},
 {href:"/lithium",cls:"lithium",symbol:"Li",name:"锂",en:"LITHIUM",desc:"锂辉石、盐湖与化学品端的分阶段供给研究。",count:"8",features:"地图 · 指引 · 事件"},
 {href:"/nickel",cls:"nickel",symbol:"Ni",name:"镍",en:"NICKEL",desc:"红土镍、硫化镍及不同中间产品的供给研究。",count:"8",features:"地图 · 状态 · 事件"},
 {href:"/aluminum",cls:"aluminum",symbol:"Al",name:"铝",en:"ALUMINUM",desc:"铝土矿、氧化铝与上游产业链的分阶段供给研究。",count:"8",features:"地图 · 产能 · 事件"},
 {href:"/tin",cls:"tin",symbol:"Sn",name:"锡",en:"TIN",desc:"锡矿与精炼端分阶段供给研究，首批覆盖 Bisie 矿区。",count:"1",features:"产量 · 口径 · 来源"},
 {href:"/iron",cls:"iron",symbol:"Fe",name:"铁",en:"IRON",desc:"铁矿石、球团与精矿的产品吨和权益口径研究。",count:"2",features:"产量 · 口径 · 来源"},
];
export default function HomePage(){return <main className="metal-hub"><header className="metal-hub-hero"><div><span>METALS ATLAS / 研究公开版</span><h1>一个入口，<br/>阅读六种金属。</h1></div><p>铜、锂、镍、铝、锡、铁现已归入同一套供给研究终端。选择金属后，可查看已覆盖的供应资产、生产数据、来源证据和项目详情；各金属的首批覆盖范围在页面内说明。</p></header><section className="metal-hub-grid" aria-label="选择金属研究终端">{metals.map((m,i)=><Link key={m.symbol} href={m.href} className={`metal-hub-card ${m.cls}`}><span className="metal-hub-symbol">{m.symbol}</span><div><small>{String(i+1).padStart(2,"0")} / {m.en}</small><h2>{m.name}</h2><p>{m.desc}</p><dl><div><dt>项目</dt><dd>{m.count}</dd></div><div><dt>功能</dt><dd>{m.features}</dd></div></dl></div><b>进入{m.name}页面 →</b></Link>)}</section><section className="metal-hub-method"><div><span>统一标准</span><h2>六种金属，共用同一套数据边界。</h2></div><ul><li>缺失数据保持 null，不转换为零</li><li>季度、年度、YTD 与长期目标分别标注</li><li>项目 100% 与公司应占口径明确区分</li><li>每项事实连接至具体官方来源材料</li></ul></section></main>}
