import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLmeSnapshot } from "./update-inventories.mjs";

export const FILE = new URL("../data/metal-inventories.json", import.meta.url);
export const SHFE = "https://www.shfe.com.cn/data/tradedata/future/stockdata";
export const GFEX = "http://www.gfex.com.cn/u/interfacesWebTdWbillWeeklyQuotes/loadList";
export const today = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
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
export function isEmptyGfexReport(payload,date) {
 return String(payload.code)==="0"&&payload.param?.gen_date?.[0]===date.replaceAll("-","")&&Array.isArray(payload.data)&&(!payload.data.length||payload.data.every(x=>x.varietyOrder===""&&x.wbillQty===null&&x.lastWbillQty===null));
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
export async function fetchText(url, options={}) {
 const response=await fetch(url,{...options,headers:{"user-agent":"MetalsAtlas public inventory monitor",...options.headers},signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 return response.text();
}
function upsert(items,record) {const i=items.findIndex(x=>x.id===record.id);if(i<0)items.push(record);else items[i]=record;}
function add(data, {metal,exchange,type,frequency,snapshot,url,title,organization,locator,level="A",unit="metric_tonnes",notes,materialId,materialType,changePeriod,license,precision}) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)||snapshot.date>today()||new Date(`${snapshot.date}T00:00:00Z`).toISOString().slice(0,10)!==snapshot.date)throw new Error("Invalid or future report date");
 if(!Number.isFinite(snapshot.value)||snapshot.value<0)throw new Error("Invalid stock value");
 const sourceCode=`${exchange.toLowerCase()}-${metal}-${type}`;
 const key=snapshot.date,id=`${sourceCode}-${key}`,sourceId=materialId??`src-${id}`;
 const old=data.items.find(x=>x.id===id);
 const verification=old?.source_id===sourceId?old.verification_date:today();
 upsert(data.sources,{id:sourceId,tier:level,source_type:materialType??(level==="A"?"official_exchange_report":"media_relay_daily_snapshot"),organization,title,publication_date:key,verification_date:verification,url,locator,short_excerpt:null});
 upsert(data.items,{id,source_code:sourceCode,record_key:key,metal_id:`metal-${metal}`,exchange,inventory_type:type,production_stage:metal==="li"?"lithium_carbonate":"refined_metal",product:metal==="li"?"碳酸锂":metal==="ni"?"精炼镍":"原铝",value:snapshot.originalValue??snapshot.value,original_unit:unit,normalized_value:snapshot.value,normalized_unit:"metric_tonnes",data_date:key,effective_date:key,published_at:key,verification_date:verification,source_id:sourceId,source_tier:level,frequency,change_pct:snapshot.change_pct,change_period:changePeriod??(frequency==="weekly"?"week_over_week":exchange==="LME"?"30_day":"previous_report"),notes,precision_tonnes:precision??(exchange==="LME"?100:1),license_status:license??(level==="A"?"official_public_report":"media_relay_observed_daily_snapshot"),missing_reason:null});
}
function recordStatus(data, id, ok, detail) {
 const previous=data.status.find(x=>x.id===id);
 // Keep successful snapshots stable; refresh failures only when their meaning changes.
 if(previous?.ok===ok&&previous?.detail===detail)return;
 upsert(data.status,{id,ok,checked_at:today(),detail});
}
export function storeShfeReport(data, html, frequency, url) {
 const snapshots=["ni","al"].map(metal=>({metal,name:metal==="ni"?"镍":"铝",snapshot:parseMetalShfe(html,metal,frequency)}));
 for(const {snapshot} of snapshots)if(!url.includes(snapshot.date.replaceAll("-","")))throw new Error("SHFE report date mismatch");
 for(const {metal,name,snapshot} of snapshots)add(data,{metal,exchange:"SHFE",type:frequency==="weekly"?"weekly_inventory":"warehouse_warrants",frequency,snapshot,url,title:`上期所${name}${frequency==="weekly"?"库存周报":"仓单日报"} ${snapshot.date}`,organization:"上海期货交易所",locator:`${name} / 总计`,notes:frequency==="weekly"?`符合交割品质的${name}库存，单位吨；与已注册仓单分开，不与其他阶段或交易所相加。`:`${name}已制成仓单数量，单位吨；不等同于库存周报或社会库存。`});
 return snapshots.length;
}
export function storeGfexReport(data, payload, date) {
 const snapshot=parseGfex(payload,date),compact=date.replaceAll("-","");
 add(data,{metal:"li",exchange:"GFEX",type:"warehouse_warrants",frequency:"daily",snapshot,url:`${GFEX}?gen_date=${compact}&variety=lc`,title:`广期所碳酸锂仓单日报 ${date}`,organization:"广州期货交易所",locator:"varietyOrder=lc / 碳酸锂小计；wbillQty、lastWbillQty、diff；与逐仓库合计核对",unit:"lots",notes:"碳酸锂注册仓单，原始单位手，按碳酸锂合约 1 吨/手折算产品吨；不是锂金属吨、精矿吨或社会总库存。"});
 return 1;
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
  count+=storeShfeReport(data,report.html,frequency,report.url);
 }
 return count;
}
async function gfex(data) {
 for(let back=0;back<7;back++) {
  const day=new Date(`${today()}T00:00:00Z`);day.setUTCDate(day.getUTCDate()-back);
  if([0,6].includes(day.getUTCDay()))continue;
  const date=day.toISOString().slice(0,10),compact=date.replaceAll("-","");
  const payload=JSON.parse(await fetchText(GFEX,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({gen_date:compact,variety:"lc"}).toString()}));
  if(isEmptyGfexReport(payload,date))continue;
  return storeGfexReport(data,payload,date);
 }
 throw new Error("GFEX has no recent lithium report");
}
export function parseWestmetallStocks(html,metal) {
 const name={ni:"Nickel",al:"Aluminium"}[metal];
 if(!name)throw new Error("Unsupported LME historical metal");
 const table=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(x=>x[1]).find(x=>text(x).includes(`LME ${name} stock`));
 if(!table)throw new Error(`Missing LME ${name} stock table`);
 const header=[...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].slice(0,4).map(x=>text(x[1]));
 if(header.length!==4||header[0]!=="date"||header[3]!==`LME ${name} stock`)throw new Error("Unexpected LME historical columns");
 const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
 const rows=new Map();
 for(const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
  const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>text(x[1]));
  if(!cells.length)continue;
  if(cells.length!==4)throw new Error("Malformed LME historical row");
  const dated=cells[0].match(/^(\d{1,2})\. ([A-Za-z]+) (\d{4})$/);
  const month=dated?months.indexOf(dated[2]):-1;
  if(!dated||month<0)throw new Error("Invalid LME historical date");
  const date=`${dated[3]}-${String(month+1).padStart(2,"0")}-${dated[1].padStart(2,"0")}`;
  if(new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw new Error("Invalid LME historical date");
  const value=numeric(cells[3]);
  if(value<0||value>10_000_000)throw new Error("Invalid LME historical stock");
  if(rows.has(date)&&rows.get(date)!==value)throw new Error("Conflicting LME historical rows");
  rows.set(date,value);
 }
 if(!rows.size)throw new Error("No LME historical stock rows");
 const ordered=[...rows].sort(([a],[b])=>a.localeCompare(b));
 return ordered.map(([date,value],i)=>({date,value,change_pct:i&&ordered[i-1][1]>0?round((value-ordered[i-1][1])/ordered[i-1][1]*100):null}));
}
export function westmetallUrl(metal,year) {
 const code={ni:"Ni",al:"Al"}[metal];
 if(!code||!/^\d{4}$/.test(String(year)))throw new Error("Invalid LME historical query");
 return `https://www.westmetall.com/en/markdaten.php?action=table&field=LME_${code}_cash&year=${year}`;
}
export function storeWestmetallStocks(data,html,metal,{from,to,url}) {
 const snapshots=parseWestmetallStocks(html,metal).filter(x=>x.date>=from&&x.date<=to);
 if(!snapshots.length)throw new Error("No LME stock rows in requested range");
 for(const snapshot of snapshots){
  if(!url.includes(`field=LME_${metal==="ni"?"Ni":"Al"}_cash`)||!url.includes(`year=${snapshot.date.slice(0,4)}`))throw new Error("LME source URL does not match metal and year");
  add(data,{metal,exchange:"LME",type:"total",frequency:"daily",snapshot,url,title:`Westmetall LME ${metal==="ni"?"Nickel":"Aluminium"} stock ${snapshot.date}`,organization:"Westmetall GmbH & Co. KG（公开转载 LME 库存）",locator:`${snapshot.date} 行 / LME ${metal==="ni"?"Nickel":"Aluminium"} stock 列（第 4 列，吨）；不采集价格列`,level:"B",notes:"Westmetall 公开历史表中的 LME 总库存转录值，单位吨；与价格列及其他定义分离。变化按同表上一报告日计算，缺失日期不插值。",materialId:`src-westmetall-lme-${metal}-${snapshot.date}`,materialType:"secondary_exchange_history_table",changePeriod:"previous_report",license:"public_secondary_exchange_table_fact",precision:1});
 }
 return snapshots.length;
}
async function lme(data,metal) {
 try {
  const to=today(),start=new Date(`${to}T00:00:00Z`);start.setUTCDate(start.getUTCDate()-7);
  const from=start.toISOString().slice(0,10),url=westmetallUrl(metal,to.slice(0,4));
  return storeWestmetallStocks(data,await fetchText(url),metal,{from:from.slice(0,4)===to.slice(0,4)?from:`${to.slice(0,4)}-01-01`,to,url});
 }catch(e){console.warn(`LME ${metal} historical table unavailable, trying latest snapshot: ${e.message}`);}
 const product=metal==="ni"?"nickel":"aluminum",label=metal==="ni"?"Nickel":"Aluminum";
 const url=`https://thevaultreport.com/charts/lme/${product}`;
 const html=await fetchText(url);
 const snap=parseLmeSnapshot(html,label);
 if(data.items.some(x=>x.id===`lme-${metal}-total-${snap.date}`&&x.precision_tonnes===1))return 0;
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
