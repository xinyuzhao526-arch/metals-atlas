"use client";

import { useMemo, useState } from "react";
import { PublicSourceDrawer } from "@/components/PublicSourceDrawer";
import type { PublicSource } from "@/lib/public-data";

type LithiumProject = {
  id: string; name: string; country: string; status: "运营中" | "开发中";
  operator: string; ownership: string; stage: string; product: string;
  production: number | null; productionUnit: string; productionPeriod: string;
  productionBasis: string; guidance: string | null; capacity: string;
  reserve: string | null; sourceId: string;
};

const sources: PublicSource[] = [
  { id:"li-pls-fy26",tier:"A",source_type:"company_results",organization:"PLS Limited",title:"FY26 delivers record production and strong financial performance",publication_date:"2026-08-24",verification_date:"2026-09-28",url:"https://www.pls.com/news/pls-fy26-results",locator:"FY26 operational highlights",short_excerpt:"FY26 spodumene concentrate production and sales." },
  { id:"li-igo-fy25",tier:"A",source_type:"annual_report",organization:"IGO Limited",title:"Annual Report 2025",publication_date:"2025-08-28",verification_date:"2026-09-28",url:"https://www.igo.com.au/site/PDF/f40092c9-cf32-4565-a7b3-e189967a1920/2025AnnualReport",locator:"pp. 20–21, 34–35 · Greenbushes and Kwinana",short_excerpt:"Greenbushes production on a 100% basis and lithium business outlook." },
  { id:"li-igo-mar26",tier:"A",source_type:"quarterly_report",organization:"IGO Limited",title:"March 2026 Quarterly Activities Report",publication_date:"2026-04-30",verification_date:"2026-09-28",url:"https://www.igo.com.au/site/PDF/dc4f0f43-c5fc-4422-a75f-9c84dc120b6c/March2026QuarterlyActivitiesReport",locator:"p. 8 · revised Greenbushes FY26 guidance",short_excerpt:"Revised FY26 spodumene production guidance." },
  { id:"li-minres-q4fy26",tier:"A",source_type:"quarterly_report",organization:"Mineral Resources Limited",title:"Q4 FY26 Quarterly Activity Report",publication_date:"2026-07-30",verification_date:"2026-09-28",url:"https://www.mineralresources.com.au/news/company-updates/q4-fy26-quarterly-activity-report/",locator:"Lithium · Wodgina and Mt Marion",short_excerpt:"Quarterly attributable spodumene production and operating update." },
  { id:"li-sigma-ops",tier:"A",source_type:"company_technical_disclosure",organization:"Sigma Lithium Corporation",title:"Grota do Cirilo Operations",publication_date:"2025-03-31",verification_date:"2026-09-28",url:"https://sigmalithiumresources.com/operations/",locator:"Mining Operations · January 15 2025 resource and reserve estimate",short_excerpt:"Nameplate capacity and NI 43-101 mineral reserve and resource figures." },
  { id:"li-rio-fenix",tier:"A",source_type:"company_operation_profile",organization:"Rio Tinto",title:"Fénix lithium operation",publication_date:"2025-03-06",verification_date:"2026-09-28",url:"https://www.riotinto.com/operations/south-america/fenix",locator:"Production and asset facts",short_excerpt:"Ownership, product, operating history and production capacity." },
  { id:"li-rio-rincon",tier:"A",source_type:"company_announcement",organization:"Rio Tinto",title:"Rio Tinto approves $2.5 billion expansion of Rincon lithium project",publication_date:"2024-12-04",verification_date:"2026-09-28",url:"https://www.riotinto.com/operations/south-america/rincon",locator:"Capacity and production target footnote",short_excerpt:"Starter plant, expansion capacity and long-term production target." },
  { id:"li-sqm-20f25",tier:"A",source_type:"regulatory_filing",organization:"Sociedad Química y Minera de Chile S.A.",title:"2025 Form 20-F",publication_date:"2026-03-02",verification_date:"2026-09-28",url:"https://ir.sqm.com/static-files/ea38d208-65e2-4e5a-a636-afc2e2794c27",locator:"Lithium and Derivatives · production capacity",short_excerpt:"Lithium carbonate and lithium hydroxide production capacity disclosures." },
];

const projects: LithiumProject[] = [
  {id:"pilgangoora",name:"Pilgangoora",country:"澳大利亚",status:"运营中",operator:"PLS Limited",ownership:"PLS 100%",stage:"锂辉石采选",product:"锂辉石精矿",production:879.5,productionUnit:"kt",productionPeriod:"FY2026",productionBasis:"项目 100% · 全年",guidance:null,capacity:"1,000 ktpa 精矿",reserve:null,sourceId:"li-pls-fy26"},
  {id:"greenbushes",name:"Greenbushes",country:"澳大利亚",status:"运营中",operator:"Talison Lithium",ownership:"Talison：TLEA 51% / Albemarle 49%",stage:"锂辉石采选",product:"技术级及化学级锂辉石精矿",production:1479,productionUnit:"kt",productionPeriod:"FY2025",productionBasis:"项目 100% · 全年",guidance:"FY2026 1,375–1,425 kt（2026-03 修订）",capacity:"1,500 ktpa 精矿",reserve:null,sourceId:"li-igo-fy25"},
  {id:"wodgina",name:"Wodgina",country:"澳大利亚",status:"运营中",operator:"MARBL Joint Venture",ownership:"Mineral Resources 50% / Albemarle 50%",stage:"锂辉石采选",product:"SC6 锂辉石精矿",production:94,productionUnit:"kt dmt",productionPeriod:"FY2026 Q4",productionBasis:"MinRes 应占 50% · 季度",guidance:null,capacity:"750 ktpa SC6（项目 100%）",reserve:null,sourceId:"li-minres-q4fy26"},
  {id:"mt-marion",name:"Mt Marion",country:"澳大利亚",status:"运营中",operator:"Mineral Resources",ownership:"Mineral Resources 50% / Ganfeng 50%",stage:"锂辉石采选",product:"锂辉石精矿",production:null,productionUnit:"kt dmt",productionPeriod:"FY2026",productionBasis:"MinRes 应占 50%",guidance:"FY2026 190–210 kt SC6（应占）",capacity:"待补 / 本页未采用跨品位换算",reserve:null,sourceId:"li-minres-q4fy26"},
  {id:"grota-do-cirilo",name:"Grota do Cirilo",country:"巴西",status:"运营中",operator:"Sigma Lithium",ownership:"Sigma Lithium 100%",stage:"锂辉石采选",product:"5.3% Li₂O 锂辉石精矿",production:null,productionUnit:"kt",productionPeriod:"FY2026",productionBasis:"项目 100%",guidance:null,capacity:"270 ktpa 精矿",reserve:"P&P 76.4 Mt @ 1.29% Li₂O",sourceId:"li-sigma-ops"},
  {id:"fenix",name:"Fénix",country:"阿根廷",status:"运营中",operator:"Rio Tinto",ownership:"Rio Tinto 100%",stage:"盐湖提锂（DLE）",product:"碳酸锂 / 氯化锂折 LCE",production:null,productionUnit:"kt LCE",productionPeriod:"FY2026",productionBasis:"项目 100%",guidance:null,capacity:"32 ktpa（含 4 ktpa 氯化锂折 LCE）",reserve:null,sourceId:"li-rio-fenix"},
  {id:"rincon",name:"Rincon",country:"阿根廷",status:"开发中",operator:"Rio Tinto",ownership:"Rio Tinto 100%",stage:"盐湖提锂（DLE）",product:"电池级碳酸锂",production:null,productionUnit:"kt",productionPeriod:"建设期",productionBasis:"项目 100%",guidance:"约 53 ktpa 生产目标，40 年",capacity:"60 ktpa（3 kt starter + 57 kt expansion）",reserve:null,sourceId:"li-rio-rincon"},
  {id:"salar-de-atacama",name:"Salar de Atacama",country:"智利",status:"运营中",operator:"SQM",ownership:"SQM 运营；CORFO 租约体系",stage:"盐湖提锂 + 化学品转换",product:"碳酸锂 / 氢氧化锂",production:null,productionUnit:"kt",productionPeriod:"FY2025",productionBasis:"公司披露产能，非实际产量",guidance:null,capacity:"碳酸锂 210 ktpa；氢氧化锂 40 ktpa",reserve:null,sourceId:"li-sqm-20f25"},
];

const sourceById = (id: string) => sources.find((source) => source.id === id);

export function LithiumDataProduct() {
  const [source, setSource] = useState<PublicSource | null>(null);
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => projects.filter((project) => {
    const q = search.trim().toLowerCase();
    return (!q || `${project.name} ${project.operator} ${project.country}`.toLowerCase().includes(q))
      && (country === "all" || project.country === country)
      && (status === "all" || project.status === status);
  }), [country, search, status]);
  const countries = [...new Set(projects.map((project) => project.country))];
  const openSource = (id: string) => { const item = sourceById(id); if (item) setSource(item); };

  return <main className="terminal lithium-terminal">
    <section className="research-strip lithium-hero" aria-labelledby="lithium-title">
      <div className="metal-ident"><span className="metal-symbol lithium-symbol">Li</span><div><p>锂供给研究终端</p><h1 id="lithium-title">Lithium supply research</h1></div></div>
      <dl className="research-stats lithium-stats">
        <div><dt>数据核验</dt><dd>2026-09-28</dd></div><div><dt>项目覆盖</dt><dd>{projects.length}</dd></div><div><dt>运营项目</dt><dd>{projects.filter((p) => p.status === "运营中").length}</dd></div><div><dt>有产量事实</dt><dd>{projects.filter((p) => p.production !== null).length}</dd></div><div><dt>来源材料</dt><dd>{sources.length}</dd></div>
      </dl>
      <div className="research-actions"><button type="button" onClick={() => setSource(sources[0])}>来源索引 <span>{sources.length}</span></button></div>
      <p className="supply-thesis"><b>口径说明</b>精矿、碳酸锂、氢氧化锂和 LCE 不直接相加；项目 100% 与公司应占数值分开呈现。</p>
    </section>

    <section className="lithium-intro">
      <div><span className="lithium-overline">LI / PHASE 1A</span><h2>矿端与化学品端，<br />按阶段阅读。</h2></div>
      <p>首批覆盖澳大利亚、南美与巴西的八个关键资产。这里只展示能够回到公司官网、年报、监管文件或正式季度报告的事实；没有可靠材料的单元格保持 null，并显示“待补”。</p>
    </section>

    <section className="matrix-section lithium-matrix">
      <div className="section-heading"><div><span>01 / 项目研究矩阵</span><h2>锂资产、产量与产能</h2></div><p>{filtered.length} / {projects.length} 个项目</p></div>
      <div className="matrix-toolbar lithium-toolbar">
        <input aria-label="搜索锂项目" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目、国家或运营方" />
        <select aria-label="国家筛选" value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">全部国家</option>{countries.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="状态筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option>运营中</option><option>开发中</option></select>
      </div>
      <div className="matrix-table-wrap lithium-table-wrap"><table className="research-matrix lithium-table"><thead><tr><th>项目</th><th>国家</th><th>运营方 / 权益</th><th>生产阶段 / 产品</th><th>最新产量</th><th>当前指引</th><th>名义产能</th><th>储量</th><th>来源</th></tr></thead><tbody>{filtered.map((project) => <tr key={project.id}>
        <td><b>{project.name}</b><span>{project.status}</span></td><td>{project.country}</td><td><b>{project.operator}</b><small>{project.ownership}</small></td><td><b>{project.stage}</b><small>{project.product}</small></td>
        <td>{project.production === null ? <span className="missing-value">待补 / 未采用产能代替产量</span> : <><b>{project.production.toLocaleString()} {project.productionUnit}</b><small>{project.productionPeriod} · {project.productionBasis}</small></>}</td>
        <td>{project.guidance ?? <span className="missing-value">待补 / 未披露或不适用</span>}</td><td>{project.capacity}</td><td>{project.reserve ?? <span className="missing-value">待补 / 本批未录入</span>}</td>
        <td><button className="evidence-link" type="button" onClick={() => openSource(project.sourceId)}>A级来源 ↗</button></td>
      </tr>)}</tbody></table></div>
      <div className="lithium-mobile-cards">{filtered.map((project) => <article key={project.id}><header><div><b>{project.name}</b><span>{project.country} · {project.status}</span></div><button className="evidence-link" type="button" onClick={() => openSource(project.sourceId)}>来源 ↗</button></header><p>{project.operator} · {project.stage}</p><dl><div><dt>最新产量</dt><dd>{project.production === null ? "待补" : `${project.production.toLocaleString()} ${project.productionUnit}`}</dd></div><div><dt>产能</dt><dd>{project.capacity}</dd></div><div><dt>口径</dt><dd>{project.productionBasis}</dd></div></dl></article>)}</div>
    </section>

    <section className="lithium-method">
      <div className="section-heading"><div><span>02 / 数据边界</span><h2>不同产品、期间与权益口径不混算</h2></div><p>所有事实关联具体来源材料</p></div>
      <div className="lithium-method-grid"><article><b>NULL ≠ 0</b><p>无可靠事实时显示“待补”，不会用产能冒充产量。</p></article><article><b>阶段隔离</b><p>锂辉石精矿、碳酸锂、氢氧化锂及 LCE 分开保存。</p></article><article><b>期间明确</b><p>财年、季度、年度产量和长期目标分别标注。</p></article><article><b>权益明确</b><p>项目 100% 与运营商应占数字不会放在同一总计中。</p></article></div>
    </section>
    <PublicSourceDrawer source={source} onClose={() => setSource(null)} />
  </main>;
}
