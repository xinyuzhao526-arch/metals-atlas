"use client";

import { useState } from "react";
import dataset from "@/data/metal-inventories.json";
import { InventoryPlot } from "@/components/InventoryPlot";
import { PublicSourceDrawer } from "@/components/PublicSourceDrawer";
import type { PublicSource } from "@/lib/public-data";

type Metal = "li" | "ni" | "al";
type Observation = {
 id:string;metal_id:string;exchange:string;inventory_type:string;product:string;
 value:number|null;original_unit:string;normalized_value:number|null;data_date:string|null;
 verification_date:string;source_id:string;source_tier:string;frequency:string;
 change_pct:number|null;change_period:string;notes:string;
};
const names={li:"碳酸锂",ni:"精炼镍",al:"原铝"};
const definitions={
 li:[{key:"GFEX-warehouse_warrants",exchange:"GFEX",type:"warehouse_warrants",label:"广期所 · 碳酸锂仓单",url:"http://www.gfex.com.cn/gfex/cdrb/hqsj_tjsj.shtml"}],
 ni:[{key:"SHFE-weekly_inventory",exchange:"SHFE",type:"weekly_inventory",label:"上期所 · 库存周报",url:"https://www.shfe.com.cn/reports/tradedata/dailyandweeklydata/"},{key:"SHFE-warehouse_warrants",exchange:"SHFE",type:"warehouse_warrants",label:"上期所 · 仓单日报",url:"https://www.shfe.com.cn/reports/tradedata/dailyandweeklydata/"},{key:"LME-total",exchange:"LME",type:"total",label:"LME · 总库存",url:"https://www.lme.com/en/Metals/Non-ferrous/LME-Nickel"}],
 al:[{key:"SHFE-weekly_inventory",exchange:"SHFE",type:"weekly_inventory",label:"上期所 · 库存周报",url:"https://www.shfe.com.cn/reports/tradedata/dailyandweeklydata/"},{key:"SHFE-warehouse_warrants",exchange:"SHFE",type:"warehouse_warrants",label:"上期所 · 仓单日报",url:"https://www.shfe.com.cn/reports/tradedata/dailyandweeklydata/"},{key:"LME-total",exchange:"LME",type:"total",label:"LME · 总库存",url:"https://www.lme.com/en/Metals/Non-ferrous/LME-Aluminium"}],
};
const changes:Record<string,string>={week_over_week:"周环比",previous_report:"较上一报告", "30_day":"近 30 日"};
export function MetalInventories({metal}:{metal:Metal}) {
 const options=definitions[metal];
 const exchanges=[...new Set(options.map(item=>item.exchange))].sort();
 const [exchange,setExchange]=useState(exchanges[0]);
 const [inventoryType,setInventoryType]=useState<string|null>(null);
 const [source,setSource]=useState<PublicSource|null>(null);
 const exchangeRecords=(dataset.items as Observation[])
  .filter(item=>item.metal_id===`metal-${metal}`&&item.exchange===exchange)
  .sort((a,b)=>(b.data_date??"").localeCompare(a.data_date??""));
 const type=inventoryType??(exchange==="SHFE"?"weekly_inventory":exchange==="GFEX"?"warehouse_warrants":"total");
 const trendRecords=exchangeRecords.filter(item=>item.inventory_type===type);
 const latest=trendRecords.find(item=>item.normalized_value!==null)??trendRecords[0];
 const status=dataset.status.find(item=>item.id===(exchange==="LME"?`LME-${metal}`:exchange));
 const definition=options.find(item=>item.exchange===exchange&&item.type===type);
 const sourceById=(id:string)=>(dataset.sources as PublicSource[]).find(item=>item.id===id);
 const sourceLink=(id:string)=>{
  const material=sourceById(id);
  return material?<button className="evidence-link" type="button" onClick={()=>setSource(material)}>来源 ↗</button>:null;
 };
 const label=(item:Observation)=>options.find(option=>option.exchange===item.exchange&&option.type===item.inventory_type)?.label.split(" · ").at(-1)??item.inventory_type;
 const unit=(value:string)=>({metric_tonnes:"吨",thousand_metric_tonnes:"千吨",lots:"手"}[value]??value);
 return <section className="inventory-terminal" aria-label={`${names[metal]}交易所库存与仓单`}>
  <div className="section-heading"><div><span>03 / 仓库信号</span><h2>交易所库存，而非“全球库存”</h2></div><p>{names[metal]}产品吨；不同交易所与定义不相加，缺失日期不插值。</p></div>
  <div className="exchange-tabs" aria-label="选择交易所">{exchanges.map(item=><button key={item} className={exchange===item?"active":""} aria-pressed={exchange===item} type="button" onClick={()=>{setExchange(item);setInventoryType(null);}}>{item}</button>)}</div>
  <div className="inventory-body">
   <div className="inventory-latest"><span>最新可展示值 · {definition?.label.split(" · ").at(-1)}</span><strong>{exchange==="LME"&&latest?.normalized_value!=null?"≈ ":""}{latest?.normalized_value?.toLocaleString()??"待补"} <small>{latest?.normalized_value!=null?"metric tonnes":""}</small></strong>
    <p>数据日：{latest?.data_date??"待补"}<br/>{changes[latest?.change_period??""]??"变化"}：{latest?.change_pct!=null?`${latest.change_pct>0?"+":""}${latest.change_pct}%`:"待补"}<br/>核验：{latest?.verification_date??"待补"}</p>
    {latest?sourceLink(latest.source_id):<a className="evidence-link" href={definition?.url} target="_blank" rel="noopener noreferrer">官方报告入口 ↗</a>}
    {status?.ok===false&&<p>最近一次采集未成功{latest?"，保留上次已核验值":"，数值待补"}。</p>}
   </div>
   <InventoryPlot records={trendRecords}/>
   <div className="inventory-definitions">{exchangeRecords.map(item=><article key={item.id}>
    <div><button className="inventory-definition-select" type="button" aria-pressed={type===item.inventory_type} onClick={()=>setInventoryType(item.inventory_type)}><b>{label(item)}</b></button><span>{item.frequency==="weekly"?"周度":"日度"}</span></div>
    <strong>{item.value===null?"待补":`${item.value.toLocaleString()} ${unit(item.original_unit)}`}</strong><p>{item.data_date} · {item.source_tier} 级来源<br/>{item.notes}</p>{sourceLink(item.source_id)}
   </article>)}{!exchangeRecords.length&&<article><b>待补</b><p>尚未取得可核验的公开报告。</p></article>}</div>
  </div>
  <p className="inventory-note">{metal==="li"?"碳酸锂仓单按 1 手 = 1 吨产品展示，不等同于社会库存，也不与锂辉石精矿、氢氧化锂或锂金属吨相加。":"精炼产品库存不能替代矿石、精矿或中间品供应；仓单是特定交割状态，不与库存周报及 LME 总库存重复相加。"} 历史数据从实际采集日期积累，缺失日期不补造。</p>
  <PublicSourceDrawer source={source} onClose={()=>setSource(null)}/>
 </section>;
}
