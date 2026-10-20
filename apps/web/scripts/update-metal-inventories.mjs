import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLmeSnapshot } from "./update-inventories.mjs";

const FILE = new URL("../data/metal-inventories.json", import.meta.url);
const SHFE = "https://www.shfe.com.cn/data/tradedata/future/stockdata";
const GFEX = "http://www.gfex.com.cn/u/interfacesWebTdWbillWeeklyQuotes/loadList";
const today = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const round = x => Math.round(x * 100) / 100;
function numeric(value) {
 if (value === null || value === undefined || String(value).trim() === "" || !/^-?[\d,]+(?:\.\d+)?$/.test(String(value))) throw new Error("Missing or invalid inventory number");
 const n=Number(String(value).replaceAll(",",""));
 if(!Number.isFinite(n))throw new Error("Non-finite inventory number");
 return n;
}
const text = s => s.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
export function parseMetalShfe(html, metal, frequency) {
 const name={ni:"镍",al:"铝"}[metal];
 if(!name)throw new Error("Unsupported SHFE metal");
 const start=html.indexOf(`<div class="cell">${name}</div>`);
 if(start<0)throw new Error(`Missing ${name} section`);
 const end=html.indexOf("special_row_type",start+name.length+25);
 const section=text(html.slice(start,end<0?undefined:end));
 const date=text(html).match(/\d{4}-\d{2}-\d{2}/)?.[0];
 const row=section.match(/(?:^|\s)总计\s+([\d,]+)\s+([-\d,]+)(?:\s+([\d,]+)\s+([\d,]+)\s+([-\d,]+)\s+([-\d,]+))?/);
 if(!date||!row)throw new Error(`Missing ${name} total or date`);
 if(frequency!=="daily"&&frequency!=="weekly")throw new Error("Unknown frequency");
 if(frequency==="weekly"&&!row[3])throw new Error("Incomplete weekly inventory row");
 const value=numeric(frequency==="weekly"?row[3]:row[1]);
 const previous=frequency==="weekly"?numeric(row[1]):value-numeric(row[2]);
 if(value<0||previous<0)throw new Error("Negative stock");
 return {date,value,change:value-previous,change_pct:previous>0?round((value-previous)/previous*100):null};
}
export function parseGfex(payload, date) {
 if(String(payload.code)!=="0"||!Array.isArray(payload.data))throw new Error("GFEX report unavailable");
 if(payload.param?.gen_date?.[0]!==date.replaceAll("-",""))throw new Error("GFEX report date mismatch");
 const rows=payload.data.filter(x=>x.varietyOrder==="lc");
 const subtotal=rows.filter(x=>x.variety==="碳酸锂小计");
 if(subtotal.length!==1)throw new Error("GFEX lithium subtotal missing or ambiguous");
 const total=subtotal[0],value=numeric(total.wbillQty),previous=numeric(total.lastWbillQty),change=numeric(total.diff);
 const warehouses=rows.filter(x=>x.variety==="碳酸锂");
 if(!warehouses.length||warehouses.reduce((a,x)=>a+numeric(x.wbillQty),0)!==value||value-previous!==change||value<0||previous<0)throw new Error("GFEX lithium totals do not reconcile");
 return {date,value,change,change_pct:previous>0?round(change/previous*100):null};
}
async function fetchText(url, options={}) {
 const response=await fetch(url,{...options,headers:{"user-agent":"MetalsAtlas public inventory monitor",...options.headers},signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 return response.text();
}
function upsert(items,record) {const i=items.findIndex(x=>x.id===record.id);if(i<0)items.push(record);else items[i]=record;}
function add(data, {metal,exchange,type,frequency,snapshot,url,title,organization,locator,level="A",unit="metric_tonnes",notes}) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)||snapshot.date>today()||new Date(`${snapshot.date}T00:00:00Z`).toISOString().slice(0,10)!==snapshot.date)throw new Error("Invalid or future report date");
 if(!Number.isFinite(snapshot.value)||snapshot.value<0)throw new Error("Invalid stock value");
 const sourceCode=`${exchange.toLowerCase()}-${metal}-${type}`;
 const key=snapshot.date,id=`${sourceCode}-${key}`,sourceId=`src-${id}`;
 const old=data.items.find(x=>x.id===id);
 const verification=old?.verification_date??today();
 upsert(data.sources,{id:sourceId,tier:level,source_type:level==="A"?"official_exchange_report":"media_relay_daily_snapshot",organization,title,publication_date:key,verification_date:verification,url,locator,short_excerpt:null});
 upsert(data.items,{id,source_code:sourceCode,record_key:key,metal_id:`metal-${metal}`,exchange,inventory_type:type,production_stage:metal==="li"?"lithium_carbonate":"refined_metal",product:metal==="li"?"碳酸锂":metal==="ni"?"精炼镍":"原铝",value:snapshot.originalValue??snapshot.value,original_unit:unit,normalized_value:snapshot.value,normalized_unit:"metric_tonnes",data_date:key,effective_date:key,published_at:key,verification_date:verification,source_id:sourceId,source_tier:level,frequency,change_pct:snapshot.change_pct,change_period:frequency==="weekly"?"week_over_week":exchange==="LME"?"30_day":"previous_report",notes,license_status:level==="A"?"official_public_report":"media_relay_observed_daily_snapshot",missing_reason:null});
}
function recordStatus(data, id, ok, detail) {
 const previous=data.status.find(x=>x.id===id);
 // Keep successful snapshots stable; refresh failures only when their meaning changes.
 if(previous?.ok===ok&&previous?.detail===detail)return;
 upsert(data.status,{id,ok,checked_at:today(),detail});
}
async function shfe(data) {
 const list=JSON.parse(await fetchText("https://www.shfe.com.cn/data/tradedata/future/dailydata/stock_data_list.dat"));
 const dates=JSON.parse(list.dataList).map(String).sort().reverse();
 if(!dates.length)throw new Error("SHFE dates missing");
 let count=0;
 for(const frequency of ["daily","weekly"]) {
  let report;
  for(const compact of dates.slice(0,7)) {
   const url=`${SHFE}/${frequency}stock_${compact}/ZH/all.html`;
   try {const html=await fetchText(url);if(!html.includes('class="cell">镍</div>'))continue;report={html,url};break;}
   catch(e){if(!String(e).includes("HTTP 404"))throw e;}
  }
  if(!report)throw new Error(`SHFE ${frequency} report missing`);
  for(const metal of ["ni","al"]) {
   const name=metal==="ni"?"镍":"铝",snapshot=parseMetalShfe(report.html,metal,frequency);
   if(!report.url.includes(snapshot.date.replaceAll("-","")))throw new Error("SHFE report date mismatch");
   add(data,{metal,exchange:"SHFE",type:frequency==="weekly"?"weekly_inventory":"warehouse_warrants",frequency,snapshot,url:report.url,title:`上期所${name}${frequency==="weekly"?"库存周报":"仓单日报"} ${snapshot.date}`,organization:"上海期货交易所",locator:`${name} / 总计`,notes:frequency==="weekly"?`符合交割品质的${name}库存，单位吨；与已注册仓单分开，不与其他阶段或交易所相加。`:`${name}已制成仓单数量，单位吨；不等同于库存周报或社会库存。`});
   count++;
  }
 }
 return count;
}
async function gfex(data) {
 for(let back=0;back<7;back++) {
  const day=new Date(`${today()}T00:00:00Z`);day.setUTCDate(day.getUTCDate()-back);
  if([0,6].includes(day.getUTCDay()))continue;
  const date=day.toISOString().slice(0,10),compact=date.replaceAll("-","");
  const payload=JSON.parse(await fetchText(GFEX,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({gen_date:compact,variety:"lc"}).toString()}));
  if(Array.isArray(payload.data)&&payload.data.length===0)continue;
  const snapshot=parseGfex(payload,date);
  add(data,{metal:"li",exchange:"GFEX",type:"warehouse_warrants",frequency:"daily",snapshot,url:`${GFEX}?gen_date=${compact}&variety=lc`,title:`广期所碳酸锂仓单日报 ${date}`,organization:"广州期货交易所",locator:"varietyOrder=lc / 碳酸锂小计；wbillQty、lastWbillQty、diff；与逐仓库合计核对",unit:"lots",notes:"碳酸锂注册仓单，原始单位手，按碳酸锂合约 1 吨/手折算产品吨；不是锂金属吨、精矿吨或社会总库存。"});
  return 1;
 }
 throw new Error("GFEX has no recent lithium report");
}
async function lme(data,metal) {
 const product=metal==="ni"?"nickel":"aluminum",label=metal==="ni"?"Nickel":"Aluminum";
 const url=`https://thevaultreport.com/charts/lme/${product}`;
 const html=await fetchText(url);
 const snap=parseLmeSnapshot(html,label);
 add(data,{metal,exchange:"LME",type:"total",frequency:"daily",snapshot:{...snap,originalValue:snap.value/1000,change_pct:snap.change30dPct},unit:"thousand_metric_tonnes",url,title:`LME ${label} warehouse stocks ${snap.date}`,organization:"The Vault Report（转述 LME 报告）",locator:"HTML og:description / dated latest snapshot",level:"B",notes:"LME 总库存的公开转述快照（来源按千吨保留一位小数，折算值约至百吨）；30 日变化不是日环比。仅保存实际观察日期，不补造历史。"});
 return 1;
}
export async function main() {
 const data=JSON.parse(await readFile(FILE,"utf8"));
 const jobs=[["SHFE",()=>shfe(data)],["GFEX",()=>gfex(data)],["LME-ni",()=>lme(data,"ni")],["LME-al",()=>lme(data,"al")]];
 const results=await Promise.allSettled(jobs.map(async([id,run])=>{try{const n=await run();recordStatus(data,id,true,"公开报告读取成功");return n;}catch(e){recordStatus(data,id,false,String(e.message));throw e;}}));
 const before=await readFile(FILE,"utf8");
 const after=JSON.stringify(data,null,2)+"\n";
 if(before!==after)await writeFile(FILE,after);
 for(let i=0;i<results.length;i++)console.log(`${jobs[i][0]}: ${results[i].status==="fulfilled"?results[i].value:results[i].reason}`);
 if(results.every(x=>x.status==="rejected"))throw new Error("Every additional metal inventory source failed");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1});
