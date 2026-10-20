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
 const [activeKey,setActiveKey]=useState(options[0].key);
 const [source,setSource]=useState<PublicSource|null>(null);
 const series=options.map(option=>{
  const records=(dataset.items as Observation[]).filter(x=>x.metal_id===`metal-${metal}`&&x.exchange===option.exchange&&x.inventory_type===option.type).sort((a,b)=>(b.data_date??"").localeCompare(a.data_date??""));
  return {...option,records,latest:records.find(x=>x.normalized_value!==null)};
 });
 const selected=series.find(x=>x.key===activeKey)??series[0];
 const latest=selected.latest;
 const statusId=selected.exchange==="LME"?`LME-${metal}`:selected.exchange;
 const status=dataset.status.find(x=>x.id===statusId);
 const sourceItem=latest?(dataset.sources as PublicSource[]).find(x=>x.id===latest.source_id):undefined;
 return <section className="inventory-terminal metal-inventories" aria-label={`${names[metal]}交易所库存与仓单`}>
  <div className="section-heading"><div><span>EXCHANGE / 仓库信号</span><h2>交易所库存与仓单</h2></div><p>{names[metal]}产品吨 · 各交易所、库存与仓单分别阅读</p></div>
  <div className={`metal-inventory-cards ${metal==="li"?"single":""}`} aria-label="选择库存序列">
   {series.map(item=><button key={item.key} type="button" aria-pressed={selected.key===item.key} className={selected.key===item.key?"active":""} onClick={()=>setActiveKey(item.key)}>
    <span>{item.label}</span><strong>{item.exchange==="LME"&&item.latest?"≈ ":""}{item.latest?.normalized_value?.toLocaleString()??"待补"}<small>{item.latest?"吨":""}</small></strong>
    <time>{item.latest?.data_date??"尚未取得报告"}</time><em>{item.latest?`${item.latest.source_tier} 级来源 · ${item.latest.product}`:"暂无可核验数值"}</em>
   </button>)}
  </div>
  <div className="metal-inventory-detail">
   <div className="metal-inventory-context"><h3>{selected.label}</h3><p>{latest?.notes??"尚未取得可核验的公开报告；缺失数据不按零处理。"}</p>
    {latest&&<dl><div><dt>数据日期</dt><dd>{latest.data_date}</dd></div><div><dt>核验日期</dt><dd>{latest.verification_date}</dd></div><div><dt>{changes[latest.change_period]??"变化"}</dt><dd>{latest.change_pct===null?"待补":`${latest.change_pct>0?"+":""}${latest.change_pct}%`}</dd></div></dl>}
    {sourceItem?<button className="evidence-link" type="button" onClick={()=>setSource(sourceItem)}>查看来源与口径 ↗</button>:<a className="evidence-link" href={selected.url} target="_blank" rel="noopener noreferrer">官方报告入口 ↗</a>}
    {status?.ok===false&&<p className="inventory-update-note">最近一次采集未成功{latest?"，保留上次已核验值":"，数值待补"}。</p>}
   </div>
   <InventoryPlot records={selected.records}/>
  </div>
  <p className="metal-inventory-note">{metal==="li"?"碳酸锂仓单按 1 手 = 1 吨产品展示，不等同于社会库存，也不与锂辉石精矿、氢氧化锂或锂金属吨相加。":"精炼产品库存不能替代矿石、精矿或中间品供应；仓单是特定交割状态，不与库存周报及 LME 总库存重复相加。"} 历史数据从实际采集日期积累，缺失日期不补造。</p>
  <PublicSourceDrawer source={source} onClose={()=>setSource(null)}/>
 </section>;
}
