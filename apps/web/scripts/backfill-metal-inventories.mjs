import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILE, SHFE, GFEX, today, fetchText, storeShfeReport, storeGfexReport, storeWestmetallStocks, westmetallUrl, isEmptyGfexReport } from "./update-metal-inventories.mjs";

function validDate(value) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)throw new Error(`Invalid report date: ${value}`);
 return value;
}
export function reportDates(from,to) {
 validDate(from);validDate(to);
 if(from>to)throw new Error("Start date is after end date");
 const out=[],day=new Date(`${from}T00:00:00Z`);
 while(day.toISOString().slice(0,10)<=to){if(![0,6].includes(day.getUTCDay()))out.push(day.toISOString().slice(0,10));day.setUTCDate(day.getUTCDate()+1);}
 return out;
}
function present(data, date, exchange, type) {
 const metals=exchange==="GFEX"?["metal-li"]:["metal-ni","metal-al"];
 return metals.every(metal=>data.items.some(x=>x.data_date===date&&x.metal_id===metal&&x.exchange===exchange&&x.inventory_type===type&&x.value!==null));
}
export async function backfill(data,{from,to,fetcher=fetchText,delayMs=300,progress=()=>{}}) {
 if(to>today())throw new Error("Cannot backfill future reports");
 const dates=reportDates(from,to),outcomes=[];
 const jobs=dates.flatMap(date=>[
  {date,exchange:"GFEX",frequency:"daily",type:"warehouse_warrants"},
  {date,exchange:"SHFE",frequency:"daily",type:"warehouse_warrants"},
  {date,exchange:"SHFE",frequency:"weekly",type:"weekly_inventory"},
 ]);
 // At most two requests run at once, with a delay between reports.
 let next=0;
 const worker=async()=>{
  while(next<jobs.length){
   const job=jobs[next++],{date,exchange,frequency,type}=job;
   let outcome={...job,status:"existing",observations:0};
   if(!present(data,date,exchange,type)){
    try{
     const compact=date.replaceAll("-","");
     let count;
     if(exchange==="GFEX"){
      const payload=JSON.parse(await fetcher(GFEX,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({gen_date:compact,variety:"lc"}).toString()}));
      if(isEmptyGfexReport(payload,date))outcome.status="no_report";
      else count=storeGfexReport(data,payload,date);
     }else{
      const url=`${SHFE}/${frequency}stock_${compact}/ZH/all.html`;
      const html=await fetcher(url);
      if(!html.includes('class="cell">镍</div>'))throw new Error("SHFE response missing requested metal section");
      count=storeShfeReport(data,html,frequency,url);
     }
     if(count!==undefined){outcome.status="imported";outcome.observations=count;}
    }catch(e){outcome.status=/^HTTP 404$/.test(e.message)?"no_report":"error";if(outcome.status==="error")outcome.reason=e.message;}
    if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
   }
   outcomes.push(outcome);
   if(outcomes.length%15===0)progress(`${outcomes.length}/${jobs.length} reports checked`);
  }
 };
 await Promise.all([worker(),worker()]);
 outcomes.sort((a,b)=>`${a.date}-${a.exchange}-${a.frequency}`.localeCompare(`${b.date}-${b.exchange}-${b.frequency}`));
 data.items.sort((a,b)=>a.id.localeCompare(b.id));data.sources.sort((a,b)=>a.id.localeCompare(b.id));
 return outcomes;
}
export async function backfillLme(data,{from,to,fetcher=fetchText}) {
 reportDates(from,to);
 if(to>today())throw new Error("Cannot backfill future reports");
 const results=[];
 for(let year=Number(from.slice(0,4));year<=Number(to.slice(0,4));year++)for(const metal of ["ni","al"]){
  const url=westmetallUrl(metal,year);
  try{const count=storeWestmetallStocks(data,await fetcher(url),metal,{from,to,url});results.push({metal,year,status:"imported",count,url});}
  catch(e){results.push({metal,year,status:"error",reason:e.message,url});}
 }
 data.items.sort((a,b)=>a.id.localeCompare(b.id));data.sources.sort((a,b)=>a.id.localeCompare(b.id));
 return results;
}
export async function main(args=process.argv.slice(2)) {
 const to=args[1]??today();
 const start=new Date(`${to}T00:00:00Z`);start.setUTCMonth(start.getUTCMonth()-3);
 const from=args[0]??start.toISOString().slice(0,10);
 const dates=reportDates(from,to);
 if(dates.length>270)throw new Error("Backfill at most one year per invocation");
 const data=JSON.parse(await readFile(FILE,"utf8"));
 console.log(`Backfilling ${from} through ${to}: ${dates.length} weekday dates`);
 let outcomes=await backfill(data,{from,to,progress:console.log});
 const errors=outcomes.filter(x=>x.status==="error");
 if(errors.length){
  console.log(`Retrying ${errors.length} failed reports once`);
  const retryDates=[...new Set(errors.map(x=>x.date))];
  for(const date of retryDates){
   const retry=await backfill(data,{from:date,to:date});
   outcomes=outcomes.map(x=>x.date===date&&x.status==="error"?retry.find(y=>y.exchange===x.exchange&&y.frequency===x.frequency)??x:x);
  }
 }
 const lme=await backfillLme(data,{from,to});
 const series=[...["ni","al"].flatMap(metal=>["weekly_inventory","warehouse_warrants"].map(type=>({metal_id:`metal-${metal}`,exchange:"SHFE",inventory_type:type}))),{metal_id:"metal-li",exchange:"GFEX",inventory_type:"warehouse_warrants"},...["ni","al"].map(metal=>({metal_id:`metal-${metal}`,exchange:"LME",inventory_type:"total"}))].map(spec=>{
  const records=data.items.filter(x=>x.metal_id===spec.metal_id&&x.exchange===spec.exchange&&x.inventory_type===spec.inventory_type&&x.data_date>=from&&x.data_date<=to).sort((a,b)=>a.data_date.localeCompare(b.data_date));
  return {...spec,count:records.length,first_date:records[0]?.data_date??null,last_date:records.at(-1)?.data_date??null};
 });
 const failed=outcomes.filter(x=>x.status==="error");
 data.history={from,to,verification_date:today(),series,unavailable_reports:outcomes.filter(x=>x.status==="no_report").map(({date,exchange,frequency})=>({date,exchange,frequency,reason:"no_published_report"})),failed_reports:failed,lme:{status:lme.every(x=>x.status==="imported")?"backfilled_public_secondary":"incomplete",reports:lme}};
 await writeFile(FILE,JSON.stringify(data,null,2)+"\n");
 console.log(JSON.stringify({series,failed_reports:failed,lme},null,2));
 if(failed.length||lme.some(x=>x.status==="error"))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1});
