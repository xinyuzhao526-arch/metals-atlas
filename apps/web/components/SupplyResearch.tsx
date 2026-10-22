"use client";
import { DataScopeNote } from "@/components/DataScopeNote";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProjectMap } from "@/components/ProjectMap";
import { MergedSupplyTimeline } from "@/components/MergedSupplyTimeline";
import { InventoryPlot } from "@/components/InventoryPlot";
import { PublicSourceDrawer } from "@/components/PublicSourceDrawer";
import { SupplyProjectDetail } from "@/components/SupplyProjectDetail";
import { downloadCsv, type PublicSource } from "@/lib/public-data";
import { assetFacts, exportFacts, exportStocks, filterAssets, latestFact, missingFact, toMapProject, type SupplyConfig, type SupplyFact } from "@/lib/tin-iron-data";

import { AnnualProductionBlock, FactBlock, factValue } from "@/components/SupplyFactDisplay";
export function StockPanel({config:c,onSource}:{config:SupplyConfig;onSource:(id:string)=>void}) {
  const [channelId,setChannelId]=useState(c.stocks[0].id);
  const channel=c.stocks.find(s=>s.id===channelId)!;
  const points=[...channel.points].sort((a,b)=>a.data_date.localeCompare(b.data_date));
  const latest=points.at(-1), previous=points.at(-2);
  const latestSource=c.sources.find(s=>s.id===latest?.source_id);
  const change=latest?.value!=null && previous?.value!=null && previous.value>0 ? (latest.value-previous.value)/previous.value*100 : null;
  return <section className="inventory-terminal" aria-label={c.name+"库存与仓储信号"}>
    <div className="section-heading"><div><span>03 / 库存数据</span><h2>{c.metal==="sn"?"精炼锡库存与交割状态":"铁矿石库存与仓储口径"}</h2></div><p>具名报告快照 · 不视为实时或全球库存</p></div>
    <div className="exchange-tabs" aria-label="选择库存口径">{c.stocks.map(s=><button type="button" key={s.id} className={s.id===channelId?"active":""} aria-pressed={s.id===channelId} onClick={()=>setChannelId(s.id)}>{s.name}</button>)}</div>
    <div className="inventory-body"><div className="inventory-latest"><span>已录入报告值 · {channel.product}</span><strong>{latest?.value?.toLocaleString("en-US")??"待补"} <small>{latest?.value!=null?channel.unit:""}</small></strong><p>数据日：{latest?.data_date??"待补"}<br/>较上一已录入报告：{change===null?"待补":change.toFixed(2)+"%"}<br/>核验：{latest?.verification_date??c.updated}</p>{latest && <button className="evidence-link" type="button" onClick={()=>onSource(latest.source_id)}>{latestSource?.tier} 级 · 报告证据 ↗</button>}</div>
    <InventoryPlot records={points.map(p=>({id:p.id,normalized_value:p.value,data_date:p.data_date,frequency:"snapshot"}))}/>
    <div className="inventory-definitions"><article><b>{channel.name}</b><p>{channel.definition}</p><small>{channel.missing_reason?.detail??"仅展示逐期核验快照；未录入日期不插值，点间不连线。"}</small>{channel.source_url&&<a className="evidence-link" href={channel.source_url} target="_blank" rel="noopener noreferrer">来源材料 ↗</a>}</article>{latest&&<article><b>时间与单位</b><p>报告日与来源发布日期分别保留；来源发布：{latest.source_publication_date??"待补"}。{latest.source_publication_date_missing_reason?.detail}单位：{channel.unit}。不与其他产品阶段或库存定义重复相加。</p></article>}</div></div>
    {points.length>0&&<button className="evidence-link" type="button" onClick={()=>downloadCsv("metals-atlas-"+c.slug+"-"+channel.id+".csv",exportStocks(c,channel.id))}>导出此库存序列 CSV（含单位与来源）</button>}
    <div className="supply-stock-records">{[...points].reverse().map(p=><button type="button" onClick={()=>onSource(p.source_id)} key={p.id}><time>{p.data_date}</time><b>{p.value?.toLocaleString("en-US")??"待补"} {channel.unit}</b><span>{c.sources.find(s=>s.id===p.source_id)?.tier} 级 · 来源 ↗</span></button>)}</div>
  </section>;
}

export function SupplyResearch({config:c,projectId}:{config:SupplyConfig;projectId?:string}) {
  const [source,setSource]=useState<PublicSource|null>(null);
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [search,setSearch]=useState("");
  const [country,setCountry]=useState("all");
  const [coverage,setCoverage]=useState("all");
  const [sort,setSort]=useState("updated");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  useEffect(()=>{if(!libraryOpen)return;const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setLibraryOpen(false)};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close)},[libraryOpen]);
  const openSource=(id:string)=>setSource(c.sources.find(s=>s.id===id)??null);
  if(projectId) return <SupplyProjectDetail config={c} projectId={projectId}/>;
  const filtered=filterAssets(c,{search,country,coverage,sort});
  const selected=filtered.find(p=>p.id===selectedId)??filtered[0];
  const mapSelected=filtered.some(p=>p.id===selectedId)?selectedId:null;
  const countries=[...new Map(c.projects.map(p=>[p.iso3,p.country])).entries()];
  const productionCount=c.projects.filter(p=>c.facts.some(f=>f.project_id===p.id&&f.metric==="production"&&f.value!==null)).length;
  const reset=()=>{setSearch("");setCountry("all");setCoverage("all");setSort("updated");setSelectedId(null)};
  const exportRows=()=>downloadCsv("metals-atlas-"+c.slug+"-research.csv",exportFacts(c,filtered.map(p=>p.id)));
  const filters=<><select aria-label="国家筛选" value={country} onChange={e=>setCountry(e.target.value)}><option value="all">全部国家</option>{countries.map(([iso,name])=><option value={iso} key={iso}>{name}</option>)}</select><select aria-label="数据覆盖筛选" value={coverage} onChange={e=>setCoverage(e.target.value)}><option value="all">全部数据</option><option value="production">有产量</option><option value="guidance">有指引或目标</option><option value="reserve">有储量</option><option value="event">有供给事件</option></select></>;
  return <main className={"terminal supply-research "+c.slug+"-terminal"}>
    <section className="research-strip" aria-labelledby="terminal-title"><div className="metal-ident"><span className="metal-symbol">{c.symbol}</span><div><p>{c.name}供给研究终端</p><h1 id="terminal-title">{c.english} supply research</h1></div></div>
      <dl className="research-stats"><div><dt>资料核验</dt><dd>{c.updated}</dd></div><div><dt>资产覆盖</dt><dd>{c.projects.length}</dd></div><div><dt>有产量事实</dt><dd>{productionCount} / {c.projects.length}</dd></div><div><dt>指引 / 目标覆盖</dt><dd>{c.projects.filter(p=>assetFacts(c,p.id,"guidance").length).length} 项</dd></div><div><dt>已核验事件</dt><dd>{c.events.length}</dd></div></dl>
      <div className="research-actions"><button type="button" onClick={()=>setLibraryOpen(true)}>资料库 <span>{c.sources.length}</span></button><button type="button" onClick={exportRows}>导出 CSV</button></div>
      <p className="supply-thesis"><b>研究线索</b>{c.thesis}</p><div className="inventory-ticker" aria-label="库存快照">{c.stocks.map(s=>{const p=s.points.at(-1);return <span key={s.id}><b>{s.name}</b>{p?.value!=null?p.value.toLocaleString("en-US")+" "+s.unit+" · "+p.data_date:"待补 · 逐期报告待核验"}</span>})}</div>
    </section>
    <nav className="supply-section-nav" aria-label="终端模块"><a href="#supply-workbench">全球资产</a><a href="#supply-stocks">库存信号</a><a href="#supply-matrix">研究矩阵</a><a href="#supply-method">数据边界</a><button type="button" onClick={()=>setLibraryOpen(true)}>来源资料库 ↗</button></nav>
    <section className="supply-workbench" id="supply-workbench"><div className="map-workspace">
      <div className="section-heading"><div><span>01 / 全球项目</span><h2>{c.name}项目分布</h2></div><p>区域近似中心 · 点大小不表示产量</p></div><div className="map-filterbar">{filters}<button type="button" onClick={reset}>重置 / 全球视图</button><span>{filtered.length} / {c.projects.length} 个资产单元</span></div>
      <ProjectMap projects={filtered.map(p=>toMapProject(c,p))} selectedProjectId={mapSelected} eventProjectIds={c.events.map(e=>e.projectId)} onSelect={setSelectedId} ariaLabel={"全球"+c.name+"供应资产地图"}/>
      <div className="map-legend"><span><i className="operating"/>披露时运营中</span><span><i className="event-ring"/>有已核验事件</span><span>同一区域的矿冶单元可能重叠，请用下方列表选择。</span></div>
      <div className="supply-map-choices" aria-label="地图资产选择">{filtered.map(p=><button type="button" key={p.id} className={selected?.id===p.id?"active":""} onClick={()=>setSelectedId(p.id)} aria-pressed={selected?.id===p.id}>{p.name}</button>)}</div>
      {selected?<div className="map-selection"><div><span>{selected.country} · {selected.region}</span><h3>{selected.name}</h3><p>{selected.operator} · {selected.stage}</p></div><dl><div><dt>产品</dt><dd>{selected.product}</dd></div><div><dt>已录入季度</dt><dd>{factValue(latestFact(c,selected.id,"production","quarter"))}</dd></div><div><dt>档案基准日</dt><dd>{selected.profile_as_of}</dd></div></dl><Link href={"/"+c.slug+"/projects/"+selected.id}>打开项目档案 →</Link></div>:<p role="status" className="detail-missing-block">没有匹配资产，请调整筛选。</p>}
    </div><MergedSupplyTimeline metal={c.metal} curated={c.events.map(e=>({...e,projectName:c.projects.find(p=>p.id===e.projectId)?.name??e.projectId}))} projects={c.projects.map(p=>({id:p.id,name:p.name}))} selectedProjectId={mapSelected} onSelectProject={id=>{setCountry("all");setCoverage("all");setSearch("");setSelectedId(id)}} onOpenSource={openSource}/></section>
    <div id="supply-stocks"><StockPanel config={c} onSource={openSource}/></div>
    <DataScopeNote summary={c.scope}><dl className="data-scope-stages">{c.chain.map(s=><div key={s.title}><dt>{s.title}</dt><dd>{s.description}</dd></div>)}</dl></DataScopeNote>
    <section className="matrix-section" id="supply-matrix"><div className="section-heading"><div><span>04 / 项目数据</span><h2>项目研究矩阵</h2></div><p>{filtered.length} / {c.projects.length} 项 · 不汇总不兼容口径</p></div>
      <div className="matrix-toolbar"><input aria-label={"搜索"+c.name+"项目"} value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索项目、国家或运营方"/>{filters}<select aria-label="排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">档案基准日</option><option value="name">项目名称</option><option value="country">国家</option></select><button type="button" onClick={exportRows}>导出当前 CSV</button></div>
      <div className="matrix-table-wrap supply-matrix-wrap"><table className="research-matrix"><thead><tr><th>资产 / 国家</th><th>运营方 / 阶段</th><th>已录入季度产量</th><th>年度累计 / 全年</th><th>指引 / 目标</th><th>储量</th><th>最近已录入事件</th><th>核验</th></tr></thead><tbody>{filtered.map(p=>{const event=c.events.filter(e=>e.projectId===p.id).sort((a,b)=>b.date.localeCompare(a.date))[0];return <tr key={p.id} data-map-project={p.id} tabIndex={-1}><td><Link href={"/"+c.slug+"/projects/"+p.id}><b>{p.name} →</b></Link><span>{p.country} · 披露时运营中</span></td><td><b>{p.operator}</b><small>{p.stage} · {p.product}</small><small>{p.ownership}</small></td><td><FactBlock fact={latestFact(c,p.id,"production","quarter")} onSource={openSource} compact/></td><td><AnnualProductionBlock config={c} projectId={p.id} onSource={openSource} compact/>{p.id==="iron-bridge"&&<><small>另列精矿发运（非生产）</small><FactBlock fact={latestFact(c,p.id,"shipments")} onSource={openSource} compact/></>}</td><td><FactBlock fact={latestFact(c,p.id,"guidance")} onSource={openSource}/></td><td><FactBlock fact={latestFact(c,p.id,"reserve")} onSource={openSource}/></td><td>{event?<><b>{event.headline}</b><small>{event.date}</small><button type="button" className="evidence-link" onClick={()=>openSource(event.sourceId)}>事件来源 ↗</button></>:<span className="missing-value">待补</span>}</td><td><span>A 级</span><small>{c.updated}</small><small>档案 {p.profile_as_of}</small></td></tr>})}</tbody></table></div>
      <div className="supply-mobile-matrix">{filtered.map(p=><article key={p.id} data-map-project={p.id} tabIndex={-1}><Link href={"/"+c.slug+"/projects/"+p.id}><h3>{p.name} →</h3></Link><p>{p.country} · {p.operator}<br/>{p.stage} · {p.product}</p><dl><div><dt>已录入季度</dt><dd><FactBlock fact={latestFact(c,p.id,"production","quarter")} onSource={openSource} compact/></dd></div><div><dt>全年 / 年度累计</dt><dd><AnnualProductionBlock config={c} projectId={p.id} onSource={openSource} compact/></dd></div><div><dt>指引 / 目标</dt><dd><FactBlock fact={latestFact(c,p.id,"guidance")} onSource={openSource}/></dd></div></dl></article>)}</div>
      {!filtered.length&&<p role="status" className="detail-missing-block">没有匹配资产。<button type="button" onClick={reset}>清除筛选</button></p>}
    </section>
    <section className="supply-method" id="supply-method"><div className="section-heading"><div><span>05 / 数据边界</span><h2>数据口径说明</h2></div></div><div className="lithium-method-grid"><article><b>NULL ≠ 0</b><p>未录入或不能独立核验的数值保留 null，并记录缺失原因。</p></article><article><b>期间分开</b><p>日历年、财年、季度、YTD 与历史指引单独列示，核验日不替代生效日。</p></article><article><b>权益与产品分开</b><p>{c.scope}</p></article><article><b>披露覆盖有限</b><p>本批是具名资产与固定报告快照，尚未覆盖全部全球供应，历史报告不冒充最新生产。</p></article></div></section>
    {libraryOpen&&<div className="source-library-backdrop" onClick={()=>setLibraryOpen(false)}><section className="source-library" role="dialog" aria-modal="true" aria-label={c.name+"来源资料库"} onClick={e=>e.stopPropagation()}><header><div><span>{c.symbol.toUpperCase()} / 资料库</span><h2>{c.name}来源索引</h2></div><button autoFocus aria-label="关闭来源资料库" type="button" onClick={()=>setLibraryOpen(false)}>×</button></header><div>{c.sources.map(s=><button key={s.id} type="button" onClick={()=>{setLibraryOpen(false);setSource(s)}}><span className={"tier tier-"+s.tier.toLowerCase()}>{s.tier}</span><div><b>{s.title}</b><small>{s.organization} · 发布 {s.publication_date??"待补"} · 核验 {s.verification_date}</small><em>{s.locator}</em></div><i>查看 →</i></button>)}</div></section></div>}
    <PublicSourceDrawer source={source} onClose={()=>setSource(null)}/>
  </main>;
}
