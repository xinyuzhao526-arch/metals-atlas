import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { backfill, reportDates } from "../scripts/backfill-metal-inventories.mjs";
import { parseMetalShfe, parseGfex, parseWestmetallStocks, storeWestmetallStocks } from "../scripts/update-metal-inventories.mjs";
import { parseLmeSnapshot } from "../scripts/update-inventories.mjs";

const header=name=>`<tr class="special_row_type"><div class="cell">${name}</div></tr>`;
const row=(...cells)=>`<tr>${cells.map(x=>`<td>${x}</td>`).join("")}</tr>`;
test("SHFE isolates nickel and aluminum from copper and different inventory definitions",()=>{
 const daily=`2026-10-20 ${header("铜")}${row("总计",999,0)}${header("铝")}${row("总计",800,-20)}${header("镍")}${row("总计",100,5)}${header("锡")}`;
 assert.deepEqual(parseMetalShfe(daily,"ni","daily"),{date:"2026-10-20",value:100,change:5,change_pct:5.26});
 assert.equal(parseMetalShfe(daily,"al","daily").value,800);
 assert.throws(()=>parseMetalShfe(daily,"ni","weekly"),/Incomplete/);
 const weekly=`2026-10-16 ${header("铝")}${row("总计",1000,500,1100,600,100,100)}${header("镍")}${row("总计",200,100,180,90,-20,-10)}${header("锡")}`;
 assert.deepEqual(parseMetalShfe(weekly,"ni","weekly"),{date:"2026-10-16",value:180,change:-20,change_pct:-10});
 assert.equal(parseMetalShfe(weekly,"al","weekly").value,1100);
 assert.throws(()=>parseMetalShfe(header("铜"),"ni","daily"),/Missing/);
});
function gfex(){return {code:"0",param:{gen_date:["20261020"]},data:[{varietyOrder:"",variety:"总计",wbillQty:900},{varietyOrder:"si",variety:"工业硅小计",wbillQty:800},{varietyOrder:"lc",variety:"碳酸锂",wbillQty:40},{varietyOrder:"lc",variety:"碳酸锂",wbillQty:60},{varietyOrder:"lc",variety:"碳酸锂小计",wbillQty:100,lastWbillQty:110,diff:-10}]};}
test("GFEX validates lithium subtotal, report date, warehouse reconciliation and missing values",()=>{
 assert.deepEqual(parseGfex(gfex(),"2026-10-20"),{date:"2026-10-20",value:100,change:-10,change_pct:-9.09});
 assert.throws(()=>parseGfex(gfex(),"2026-10-19"),/date mismatch/);
 const wrong=gfex();wrong.data[2].wbillQty=41;assert.throws(()=>parseGfex(wrong,"2026-10-20"),/reconcile/);
 for(const value of [null,"",undefined]){const missing=gfex();missing.data[4].wbillQty=value;assert.throws(()=>parseGfex(missing,"2026-10-20"),/Missing/);}
 const zero=gfex();zero.data=zero.data.filter(x=>x.varietyOrder==="lc");for(const x of zero.data){x.wbillQty=0;x.lastWbillQty=0;x.diff=0;}
 assert.equal(parseGfex(zero,"2026-10-20").value,0);assert.equal(parseGfex(zero,"2026-10-20").change_pct,null);
});
test("LME supports dated OpenGraph snapshots and prevents cross-metal substitution",()=>{
 const html='<meta name="description" content="Abbreviated chart summary"/><meta property="og:description" content="As of October 19, 2026, London Metal Exchange Aluminum total warehouse stocks stands at 236.4K mt. It has declined by 2.6% over the past 30 days. Additional commentary."/>';
 assert.deepEqual(parseLmeSnapshot(html,"Aluminum"),{date:"2026-10-19",value:236400,change30dPct:-2.6});
 assert.throws(()=>parseLmeSnapshot(html,"Nickel"),/could not be parsed/);
 assert.throws(()=>parseLmeSnapshot(html),/could not be parsed/);
});
test("new inventory dataset retains metal, stage, provenance and stable observation keys",()=>{
 const data=JSON.parse(readFileSync(new URL("../data/metal-inventories.json",import.meta.url),"utf8"));
 const sources=new Map(data.sources.map(s=>[s.id,s]));const keys=new Set();
 for(const item of data.items){
  const key=`${item.source_code}:${item.record_key}`;assert.ok(!keys.has(key));keys.add(key);
  assert.ok(["metal-ni","metal-li","metal-al"].includes(item.metal_id));
  assert.equal(item.production_stage,item.metal_id==="metal-li"?"lithium_carbonate":"refined_metal");
  assert.equal(item.effective_date,item.data_date);assert.ok(item.verification_date);
  if(item.value===null)assert.ok(item.missing_reason);else assert.ok(Number.isFinite(item.value)&&item.value>=0);
  const source=sources.get(item.source_id);assert.ok(source);
  for(const k of ["organization","title","url","publication_date","verification_date","source_type"])assert.ok(source[k],k);
 }
 for(const [metal,exchange,type] of [["li","GFEX","warehouse_warrants"],["ni","SHFE","weekly_inventory"],["ni","SHFE","warehouse_warrants"],["al","SHFE","weekly_inventory"],["al","SHFE","warehouse_warrants"]])assert.ok(data.items.some(x=>x.metal_id===`metal-${metal}`&&x.exchange===exchange&&x.inventory_type===type));
});


test("historical dates exclude weekends and reject invalid ranges",()=>{
 assert.deepEqual(reportDates("2026-09-04","2026-09-07"),["2026-09-04","2026-09-07"]);
 assert.throws(()=>reportDates("2026-09-08","2026-09-01"),/Start date/);
 assert.throws(()=>reportDates("2026-02-30","2026-03-01"),/Invalid report date/);
});
test("backfill preserves provenance, keeps daily and weekly stocks separate, and is idempotent",async()=>{
 const data={items:[],sources:[],status:[]};let calls=0;
 const fetcher=async(url,options)=>{
  calls++;
  if(url.includes("gfex")){
   assert.match(options.body,/gen_date=20261020/);return JSON.stringify(gfex());
  }
  if(url.includes("weeklystock"))return `2026-10-20 ${header("铝")}${row("总计",1000,500,1100,600,100,100)}${header("镍")}${row("总计",200,100,180,90,-20,-10)}${header("锡")}`;
  return `2026-10-20 ${header("铝")}${row("总计",800,-20)}${header("镍")}${row("总计",100,5)}${header("锡")}`;
 };
 let results=await backfill(data,{from:"2026-10-20",to:"2026-10-20",fetcher,delayMs:0});
 assert.ok(results.every(x=>x.status==="imported"));assert.equal(data.items.length,5);assert.equal(calls,3);
 assert.equal(data.items.filter(x=>x.metal_id==="metal-ni"&&x.inventory_type==="weekly_inventory")[0].value,180);
 for(const item of data.items){assert.equal(item.data_date,"2026-10-20");assert.ok(data.sources.some(x=>x.id===item.source_id&&x.publication_date===item.data_date));}
 const saved=JSON.stringify(data);
 results=await backfill(data,{from:"2026-10-20",to:"2026-10-20",fetcher,delayMs:0});
 assert.ok(results.every(x=>x.status==="existing"));assert.equal(calls,3);assert.equal(JSON.stringify(data),saved);
});
test("missing reports and parse failures never become zero-valued history",async()=>{
 const data={items:[],sources:[],status:[]};
 const results=await backfill(data,{from:"2026-10-19",to:"2026-10-19",delayMs:0,fetcher:async(url)=>{
  if(url.includes("gfex"))return JSON.stringify({code:"0",param:{gen_date:["20261019"]},data:[{varietyOrder:"",wbillQty:null,lastWbillQty:null}]});
  if(url.includes("weeklystock"))throw new Error("HTTP 404");
  return `2026-10-16 ${header("铝")}${row("总计",800,-20)}${header("镍")}${row("总计",100,5)}${header("锡")}`;
 }});
 assert.equal(results.filter(x=>x.status==="no_report").length,2);
 assert.match(results.find(x=>x.status==="error").reason,/date mismatch/);
 assert.deepEqual(data.items,[]);assert.deepEqual(data.sources,[]);
});

const lmeTable=(metal="Nickel",stock="273,222")=>`<table><tr><th>date</th><th>LME ${metal} Cash-Settlement</th><th>LME ${metal} 3-month</th><th>LME ${metal} stock</th></tr><tr><td>21. July 2026</td><td>16,970.00</td><td>17,160.00</td><td>272,040</td></tr><tr><td>20. July 2026</td><td>16,850.00</td><td>17,040.00</td><td>${stock}</td></tr></table>`;
test("LME history reads stock column instead of price columns and validates metal and missing values",()=>{
 const records=parseWestmetallStocks(lmeTable(),"ni");
 assert.equal(records[0].date,"2026-07-20");assert.equal(records[0].value,273222);
 assert.equal(records[1].change_pct,-0.43);
 assert.throws(()=>parseWestmetallStocks(lmeTable(),"al"),/Missing/);
 assert.throws(()=>parseWestmetallStocks(lmeTable("Nickel","-"),"ni"),/Missing or invalid/);
 assert.throws(()=>parseWestmetallStocks(lmeTable().replace("21. July","32. July"),"ni"),/Invalid/);
});
test("LME historical import preserves per-date sources and one observation per date across reruns",()=>{
 const data={items:[],sources:[],status:[]};
 const options={from:"2026-07-20",to:"2026-07-21",url:"https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Ni_cash&year=2026"};
 assert.equal(storeWestmetallStocks(data,lmeTable(),"ni",options),2);
 const saved=JSON.stringify(data);storeWestmetallStocks(data,lmeTable(),"ni",options);
 assert.equal(JSON.stringify(data),saved);assert.equal(data.items.length,2);
 for(const x of data.items){assert.equal(x.source_tier,"B");assert.equal(x.precision_tonnes,1);assert.equal(x.original_unit,"metric_tonnes");assert.equal(x.change_period,"previous_report");assert.ok(data.sources.some(s=>s.id===x.source_id&&s.organization.includes("Westmetall")));}
 const rejected={items:[],sources:[]};
 assert.throws(()=>storeWestmetallStocks(rejected,lmeTable(),"ni",{...options,url:options.url.replace("year=2026","year=2025")}),/does not match/);
 assert.deepEqual(rejected.items,[]);
});
