import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sources, mediaFeeds, paiPaiEventsUrl } from "./news-sources.mjs";
export { sources, mediaFeeds };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const METALS = ["cu","li","ni","al","sn","fe","zn","pb"];
const officialTypes = new Set(["official_company_news","company_regulatory_announcement"]);
export const decode = text => String(text ?? "")
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_m,n) => {const v=n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):"";})
  .replace(/&(amp|quot|apos|nbsp|lt|gt|rsquo|lsquo|rdquo|ldquo|ndash|mdash);/gi, (_m,n) => ({amp:"&",quot:'"',apos:"'",nbsp:" ",lt:"<",gt:">",rsquo:"'",lsquo:"'",rdquo:'"',ldquo:'"',ndash:"–",mdash:"—"}[n.toLowerCase()]));
const plain = text => decode(String(text??"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
export function canonicalUrl(value, base) {
  try {const u=new URL(decode(value),base);if(!["http:","https:"].includes(u.protocol))return null;u.hash="";u.pathname=u.pathname.replace(/^\/index\.php\//,"/");for(const key of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid)/i.test(key))u.searchParams.delete(key);return u.href.replace(/\/$/,"");}catch{return null;}
}
const patterns = {
  cu:/\b(copper|kamoa|kakula|grasberg|freeport|collahuasi|pelambres|centinela|las bambas|escondida|quellaveco|salobo|sierra gorda)\b|铜/i,
  li:/\b(lithium|spodumene|pilgangoora|greenbushes|wodgina|mt marion|rincon|f[eé]nix|olaroz|goulamina)\b|碳酸锂|锂辉石|氢氧化锂/i,
  ni:/\b(nickel|on[çc]a puma|voisey|sudbury|murrin murrin|weda bay|sorowako|nova|nickel west|ambatovy|nornickel)\b|镍/i,
  al:/\b(aluminium|aluminum|alumina|bauxite|weipa|gove|paragominas|worsley|alunorte|al taweelah|mozal|hillside)\b|铝土矿|氧化铝|电解铝/i,
  sn:/\b(tin|alphamin|bisie|mpama|renison|uis|san rafael|pisco)\b|锡/i,
  fe:/\b(iron[ -]ore|hematite|haematite|magnetite|pilbara|waio|s11d|sishen|minas[ -]rio|iron bridge|fortescue)\b|铁矿石|铁矿/i,
  zn:/\b(zinc|red dog|dugald river|rosebery|gamsberg|zinkgruvan)\b|锌/i,
  pb:/\b(lead (?:mine|ore|production|concentrate|smelt|refin)|(?:zinc|silver)[-/ ]lead|cannington|red dog|rosebery|zinkgruvan)\b|铅/i,
};
const supply = /\b(production|guidance|output|shipments?|operations?|operational|restart|resum(?:e|es|ption)|suspend(?:ed|sion)?|shutdown|halt(?:ed|s)?|maintenance|incident|expan(?:sion|d|ding)|ramp[ -]up|commission(?:ed|ing)?|mine|resource|ore reserve|permit|quarter(?:ly)?|annual (?:report|results)|results|acquir(?:e|es|ed|ing)|acquisition|merger|takeover|divest(?:ment)?|stake|offtake|supply agreement|export|tariff|sanction|strike|closure|flood|fire|disruption|feedstock|recycl(?:e|ing))\b|产量|指引|停产|复产|扩建|储量|投产|并购|包销|出口|监管|检修/i;
const hardSupply = /\b(production|guidance|output|operational|restart|suspend|shutdown|maintenance|expansion|commission|ore reserve|feedstock|acquisition|takeover)\b|产量|投产|检修|复产|并购/i;
const pureNoise = /\b(privacy|careers?|contact|cookie|newsletter|podcast|webinar|webcast details|share price|price forecast|market outlook|appointment|governance|sustainability|emissions|climate|conference|awards?|copper mark|financial calendar|release dates|report advisory|report retraction|conference call|results presentation|annual general meetings?|annual meeting|voting results|to release .*results|notice of .*results|drill results|grab sample results|private placement|financing|funding|loan facility|feasibility study|scoping study)\b|价格预测|招聘|人事|任命|披露日期/i;
const equipmentNoise=/\b(equipment|software|gyratory|bags?.*order|wins?.*order|hydrogen production|solar cells)\b/i;
const lowSignal = /\b(dividend|drilling|assay|feasibility study|scoping study|financing|private placement|funding|equipment|software|gyratory|bags?.*order|wins?.*order)\b|融资|钻探|设备|订单/i;
const report = /\b(quarter(?:ly)?|q[1-4]|half[- ]year|full[- ]year|annual|operational review|production report|production and sales)\b/i;
export function relevantTitle(title) {
  return !pureNoise.test(title) && !equipmentNoise.test(title) && supply.test(title) && (!lowSignal.test(title) || hardSupply.test(title));
}
const metalsIn = text => METALS.filter(m=>patterns[m].test(text));
function classifyMany(title, source = {}, body = "") {
  if(!relevantTitle(title))return [];
  const allowed=source.metals??(source.metal && source.metal!=="both"?[source.metal]:METALS);
  const explicit=metalsIn(title);
  if(explicit.length)return explicit.filter(m=>allowed.includes(m));
  const fromBody=metalsIn(body).filter(m=>allowed.includes(m));
  if(fromBody.length)return fromBody;
  if(report.test(title))return source.reportMetals??(allowed.length===1?allowed:[]);
  return source.strict===false&&allowed.length===1?allowed:[];
}
export function classify(title, configuredMetal="both", strict=false) {
  const found=classifyMany(title,{metal:configuredMetal,strict});
  return found.length===1?found[0]:null;
}
export function classifyMetals(title, source={}, body="") {return classifyMany(title,source,body);}
export function publishedDate(value) {
  const s=plain(value);
  const iso=s.match(/^(20\d{2})-(\d{2})-(\d{2})(?:T.*)?$/);
  if(iso){const day=iso.slice(1).join("-"),d=new Date(day+"T00:00:00Z");return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===day?day:null;}
  const months=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const dmy=s.match(/\b(\d{1,2})[\s,-]+(Jan[a-z]*|Feb[a-z]*|Mar[a-z]*|Apr[a-z]*|May|Jun[a-z]*|Jul[a-z]*|Aug[a-z]*|Sep[a-z]*|Oct[a-z]*|Nov[a-z]*|Dec[a-z]*)[\s,-]+(20\d{2})\b/i);
  const mdy=s.match(/\b(Jan[a-z]*|Feb[a-z]*|Mar[a-z]*|Apr[a-z]*|May|Jun[a-z]*|Jul[a-z]*|Aug[a-z]*|Sep[a-z]*|Oct[a-z]*|Nov[a-z]*|Dec[a-z]*)\s+(\d{1,2})[\s,]+(20\d{2})\b/i);
  if(dmy||mdy){const m=dmy??mdy,month=months.indexOf((dmy?m[2]:m[1]).slice(0,3).toLowerCase())+1;return publishedDate(m[3]+"-"+String(month).padStart(2,"0")+"-"+String(dmy?m[1]:m[2]).padStart(2,"0"));}
  if(/^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/.test(s)){
    const [a,b,c]=s.split(/[/.]/).map(Number),year=c<100?2000+c:c;
    if(a<=12&&b>12)return publishedDate(String(year)+"-"+String(a).padStart(2,"0")+"-"+String(b).padStart(2,"0"));
    if(a>12&&b<=12)return publishedDate(String(year)+"-"+String(b).padStart(2,"0")+"-"+String(a).padStart(2,"0"));
  }
  return null;
}

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),decode(m[2])]));
}
export function articleDate(html) {
  const displayed=html.match(/<(?:div|p|span)[^>]*class=["'][^"']*\b(?:pr-date|article-date|news__date)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i);
  if(displayed){const d=publishedDate(displayed[1]);if(d)return d;}

  for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(m[0]);if(/^(article:published_time|date|datepublished|publication_date|dc\.date|dc\.date\.issued)$/i.test(a.property??a.name??"")){const d=publishedDate(a.content);if(d)return d;}}
  for(const m of html.matchAll(/"datePublished"\s*:\s*"([^"]+)"/gi)){const d=publishedDate(m[1]);if(d)return d;}
  for(const m of html.matchAll(/<time\b[^>]*>/gi)){const a=attrs(m[0]);const d=publishedDate(a.datetime);if(d)return d;}
  // RNS displays the issuer's release date separately from the reporting period.
  const rns=html.match(/(?:announcement-date|published-date|date-published)[^>]*>([\s\S]*?)<\//i);
  if(rns){const d=publishedDate(rns[1]);if(d)return d;}
  return null;
}
export function articleBody(html) {
  const rns=html.indexOf('class="fr-view-element"'),press=html.indexOf('class="pr-date"');
  let body;
  if(rns>=0){
    const start=html.lastIndexOf("<div",rns);let depth=0,end=html.length;
    for(const tag of html.slice(start).matchAll(/<\/?div\b[^>]*>/gi)){
      depth+=tag[0].startsWith("</")?-1:1;
      if(depth===0){end=start+tag.index+tag[0].length;break;}
    }
    body=html.slice(start,end);
  }
  else if(press>=0)body=html.slice(press);
  else body=(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)??html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i))?.[1]??html;
  return plain(body.replace(/<(script|style|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,"").replace(/<div[^>]*class=["'][^"']*ai[-_ ]summary[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,""));
}

export function tagFor(text) {
  if(/halt|suspend|shutdown|strike|accident|fatal|fire|flood|disruption|outage|closure|restart|maintenance|停产|事故|减产|复产|检修/i.test(text))return "供给扰动";
  if(/expansion|expand|ramp|commission|first production|commercial production|扩产|投产/i.test(text))return "扩产投产";
  if(/acquir|merger|takeover|divest|stake|并购|收购|出售|股权/i.test(text))return "并购股权";
  if(/offtake|supply agreement|包销|长协/i.test(text))return "长协包销";
  if(/production|output|quarter|guidance|results|产量|指引/i.test(text))return "产量与指引";
  return "政策与供给";
}


export function parseRssItems(xml, feed) {
  const rows=[];
  const blocks=[...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)];
  for(const match of blocks){
    const block=match[1];
    const pick=tag=>block.match(new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/"+tag+">","i"))?.[1]??"";
    const title=plain(pick("title"));
    const link=plain(pick("link"))||attrs(block.match(/<link\b[^>]*href=["'][^"']+["'][^>]*>/i)?.[0]??"").href;
    const url=canonicalUrl(link,feed.url??feed.endpoints?.[0]?.url);
    if(!title||!url||!relevantTitle(title))continue;
    const context=plain(pick("description")||pick("summary")||pick("content:encoded"));
    const date=publishedDate(plain(pick("pubDate")||pick("published")||pick("dc:date")));
    for(const metal of classifyMany(title,feed,context)){
      rows.push({title,url,metal,date,organization:feed.organization,tag:tagFor(title)});
    }
  }
  return rows;
}
export function parsePaiPaiEvents(payload) {
  const allowed={Cu:["cu"],Li:["li"],Ni:["ni"],Al:["al"],Sn:["sn"],Fe:["fe"],Zn:["zn"],Pb:["pb"],PbZn:["pb","zn"]};
  const rows=[];
  for(const e of payload?.events??[]){
    const url=canonicalUrl(e?.links?.[0]?.url),date=publishedDate(e?.d);
    if(!e?.title||!url||!date||!relevantTitle(e.title))continue;
    for(const metal of new Set((e.metals??[]).flatMap(m=>allowed[m]??[]))){
      rows.push({title:plain(e.title),url,metal,date,organization:e.src||"PaiPaiMetals",tag:e.tag||tagFor(e.title)});
    }
  }
  return rows;
}
export function parseOfficialLinks(html, source) {
  const found=new Map(),dateByUrl=new Map();
  for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const firstCell=row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1];
    const date=publishedDate(firstCell);
    if(date)for(const a of row[1].matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)){dateByUrl.set(canonicalUrl(a[1],source.url),date);}
  }
  const hosts=(source.articleHosts??[source.host??new URL(source.url).hostname]).map(h=>h.replace(/^www\./,""));
  for(const a of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    let title=plain(a[2].match(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>/i)?.[1]??a[2]);const linkAttrs=attrs(a[0].slice(0,a[0].indexOf(">")+1));if(title.length<12)title=plain(linkAttrs["aria-label"]??linkAttrs.title??attrs(a[2].match(/<img\b[^>]*>/i)?.[0]??"").alt??title);
    let url=canonicalUrl(a[1],source.url);if(url&&url.startsWith("http:")&&new URL(url).hostname.replace(/^www\./,"")===new URL(source.url).hostname.replace(/^www\./,""))url=url.replace(/^http:/,"https:");
    if(!url||title.length<12||!hosts.includes(new URL(url).hostname.replace(/^www\./,"")))continue;
    if(source.articlePattern&&!new RegExp(source.articlePattern,"i").test(new URL(url).pathname))continue;
    if(/(?:\/(?:privacy|contact|reports-library|annual-reports|news|investors|results-centre-and-presentations))$/i.test(new URL(url).pathname))continue;
    const metals=classifyMany(title,source);
    for(const metal of metals){
      const item={title,url,metal};
      const listingDate=dateByUrl.get(url);
      if(listingDate)item.date=listingDate;
      if(source.dateInUrl){const d=new URL(url).pathname.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);if(d)item.date=publishedDate(d.slice(1).join("-"));}
      if((source.metals?.length??0)>1&&!metalsIn(title).length)item.needs_body_metals=true;
      found.set(metal+":"+url,item);
    }
  }
  return [...found.values()];
}
export async function fetchText(url, {timeout=12000, retries=1, fetchImpl=fetch, wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  let failure;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const response=await fetchImpl(url,{headers:{"user-agent":"MetalsAtlas supply-news monitor (+https://github.com/xinyuzhao526-arch/metals-atlas)","accept":"text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.5"},signal:AbortSignal.timeout(timeout)});
      if(!response.ok){const e=new Error("HTTP "+response.status);e.retryable=[408,429,500,502,503,504].includes(response.status);throw e;}
      const contentType=response.headers.get("content-type")??"";
      if(/pdf|octet-stream/i.test(contentType))throw Object.assign(new Error("Binary document requires a dated listing"),{retryable:false});
      return await response.text();
    }catch(e){failure=e;if(e.retryable===false||attempt===retries)break;await wait(500*(attempt+1));}
  }
  throw failure;
}
async function parallelMap(items, concurrency, fn) {
  const result=new Array(items.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(cursor<items.length){const i=cursor++;result[i]=await fn(items[i],i);}}));
  return result;
}
const keyOf = (metal,url) => metal+":"+canonicalUrl(url);
const titleKey = item => item.metal_id+":"+(officialTypes.has(item.source_type)?plain(item.organization).toLowerCase()+":":"")+plain(item.title).toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
const currentDate = now => now.toISOString().slice(0,10);
function inRange(date, now, days) {return Boolean(date&&date<=currentDate(now)&&date>=new Date(now.valueOf()-days*86400000).toISOString().slice(0,10));}
function groupCandidates(rows) {
  const map=new Map();
  for(const row of rows){
    const url=canonicalUrl(row.url);if(!url||!METALS.includes(row.metal))continue;
    const old=map.get(url);
    if(!old)map.set(url,{...row,url,metals:[row.metal]});
    else{old.metals=[...new Set([...old.metals,row.metal])];if(!old.date&&row.date)old.date=row.date;}
  }
  return [...map.values()];
}
export async function refreshNews(news, previousState={}, options={}) {
  const now=options.now??new Date(), checkedAt=now.toISOString(),fetcher=options.fetcher??fetchText;
  const officialSources=options.sources??sources, rssSources=options.mediaFeeds??mediaFeeds;
  const lookbackDays=options.lookbackDays??180,articleLimit=options.articleLimit??80,perMetalLimit=options.perMetalLimit??100;
  const oldItems=news.items??[],processed=new Set(previousState.processed_keys??oldItems.map(i=>keyOf(i.metal_id.replace("metal-",""),i.material_url)));
  const statuses=[],discovered=[];
  const allSources=[...officialSources,...rssSources];
  const sourceResults=await parallelMap(allSources,5,async source=>{
    const previous=previousState.sources?.find(s=>s.id===source.id),attempts=[];
    for(const endpoint of source.endpoints??[{url:source.url,kind:"html"}]){
      try{
        const text=await fetcher(endpoint.url);
        const rows=endpoint.kind==="rss"?parseRssItems(text,{...source,url:endpoint.url}):parseOfficialLinks(text,{...source,url:endpoint.url});
        attempts.push({url:endpoint.url,status:rows.length?"ok":"empty"});
        if(!rows.length)continue;
        return {status:{id:source.id,organization:source.organization,url:endpoint.url,status:"ok",candidate_count:rows.length,checked_at:checkedAt,last_success_at:checkedAt,attempts},rows:rows.map(row=>({...row,organization:source.organization,source_type:endpoint.source_type??source.source_type??"public_industry_media",source_url:endpoint.url,from_feed:endpoint.kind==="rss"}))};
      }catch(error){attempts.push({url:endpoint.url,status:"error",error:String(error.message).slice(0,220)});}
    }
    return {status:{id:source.id,organization:source.organization,url:source.endpoints?.[0]?.url??source.url,status:attempts.some(a=>a.status==="empty")?"empty":"error",candidate_count:0,checked_at:checkedAt,last_success_at:previous?.last_success_at??null,attempts},rows:[]};
  });
  for(const r of sourceResults){statuses.push(r.status);discovered.push(...r.rows);}
  if(options.eventFeed!==false){
    try{
      const rows=parsePaiPaiEvents(JSON.parse(await fetcher(paiPaiEventsUrl)));
      statuses.push({id:"paipai",organization:"PaiPaiMetals",url:paiPaiEventsUrl,status:rows.length?"ok":"empty",candidate_count:rows.length,checked_at:checkedAt,last_success_at:checkedAt});
      discovered.push(...rows.map(row=>({...row,source_type:"public_industry_media",source_url:paiPaiEventsUrl,from_feed:true})));
    }catch(error){statuses.push({id:"paipai",organization:"PaiPaiMetals",url:paiPaiEventsUrl,status:"error",candidate_count:0,checked_at:checkedAt,error:String(error.message).slice(0,220)});}
  }
  if(!statuses.some(s=>s.status!=="error"))throw new Error("Every news source failed; existing news and retry state were preserved.");
  // Old seen_urls included failed and unprocessed links. Only successfully imported per-metal keys count.
  const retries=(previousState.pending??[]).flatMap(p=>p.metals.map(metal=>({...p,metal})));
  const candidates=groupCandidates([...retries,...discovered]).filter(c=>c.metals.some(m=>!processed.has(keyOf(m,c.url))));
  candidates.sort((a,b)=>(b.date??"").localeCompare(a.date??""));
  const imported=[],pending=[],skipped=[],errors=[];
  let detailFetches=0;
  await parallelMap(candidates,4,async candidate=>{
    const already=previousState.pending?.find(p=>p.url===candidate.url);
    if(already?.next_retry_at>checkedAt){pending.push(already);return;}
    let date=candidate.date,body="",needsFetch=!date||candidate.needs_body_metals||(!candidate.from_feed&&officialTypes.has(candidate.source_type));
    const urlYear=candidate.url.match(/\/(20\d{2})(?:\/|[-_])/);
    if((date&&!inRange(date,now,lookbackDays))||(urlYear&&Number(urlYear[1])<Number(currentDate(now).slice(0,4))-1)){skipped.push(candidate.url);return;}
    if(needsFetch&&detailFetches>=articleLimit){pending.push({...candidate,attempts:already?.attempts??0,last_error:"Deferred by per-run article budget",next_retry_at:checkedAt});return;}
    try{
      if(needsFetch){
        detailFetches++;
        try{const html=await fetcher(candidate.url);date=date??articleDate(html);body=articleBody(html);}
        catch(error){if(!date||candidate.needs_body_metals)throw error;}
      }
      if(!date)throw new Error("Publication date not disclosed in a supported field; will retry");
      if(!inRange(date,now,lookbackDays)){skipped.push(candidate.url);return;}
      let metals=candidate.metals;
      if(candidate.needs_body_metals){
        const actual=metalsIn(body).filter(m=>candidate.metals.includes(m));
        if(!actual.length)throw new Error("Group report metal coverage could not be confirmed from the article");
        metals=actual;
      }
      for(const metal of metals){
        const key=keyOf(metal,candidate.url);if(processed.has(key))continue;
        imported.push({
          id:"news-"+metal+"-"+createHash("sha1").update(candidate.url).digest("hex").slice(0,16),
          metal_id:"metal-"+metal,title:plain(candidate.title).slice(0,300),organization:candidate.organization,
          source_type:candidate.source_type,source_level:officialTypes.has(candidate.source_type)?"official":"media",
          event_tag:candidate.tag??tagFor(candidate.title),material_url:candidate.url,source_listing_url:candidate.source_url,
          publication_date:date,source_publication_date:date,
          effective_date:null,effective_date_missing_reason:{code:"event_date_not_extracted",detail:"新闻发布日期不代表事件生效日；原文事件时间尚待人工核读。"},
          verification_date:currentDate(now),verification_method:"automated_metadata_check",review_status:"pending",discovered_at:checkedAt,
        });
        processed.add(key);
      }
    }catch(error){
      const attempts=(already?.attempts??0)+1;
      pending.push({...candidate,attempts,last_attempt_at:checkedAt,last_error:String(error.message).slice(0,220),next_retry_at:new Date(now.valueOf()+Math.min(24,Math.pow(2,Math.min(attempts,5)))*3600000).toISOString()});
      errors.push({url:candidate.url,error:String(error.message)});
    }
  });
  const unique=new Map(),titles=new Set();
  // Prefer direct company material over a duplicate media headline.
  const combined=[...oldItems,...imported].map(i=>({...i,title:plain(i.title),material_url:canonicalUrl(i.material_url)})).sort((a,b)=>Number(officialTypes.has(b.source_type))-Number(officialTypes.has(a.source_type)));
  for(const item of combined){
    const key=keyOf(item.metal_id.replace("metal-",""),item.material_url),tk=titleKey(item);
    if(!item.material_url||unique.has(key)||titles.has(tk))continue;unique.set(key,item);titles.add(tk);
  }
  const counts={},items=[...unique.values()].sort((a,b)=>b.publication_date.localeCompare(a.publication_date)).filter(i=>{counts[i.metal_id]=(counts[i.metal_id]??0)+1;return counts[i.metal_id]<=perMetalLimit;});
  const changed=JSON.stringify(items)!==JSON.stringify(oldItems);
  const nextNews=changed?{...news,schema_version:"2.0.0",updated_at:currentDate(now),last_checked_at:checkedAt,seen_urls:[...new Set(items.map(i=>i.material_url))].sort(),items}:news;
  const state={schema_version:"1.0.0",last_checked_at:checkedAt,processed_keys:[...processed].sort(),pending,sources:statuses,
    last_run:{added:imported.length,retained:items.length,detail_fetches:detailFetches,article_errors:errors.length,deferred:pending.filter(p=>p.attempts===0).length,by_metal:Object.fromEntries(METALS.map(m=>[m,items.filter(i=>i.metal_id==="metal-"+m).length]))}};
  return {news:nextNews,state,changed,errors};
}
export async function main() {
  const newsFile=path.join(ROOT,"data/news.json"),stateFile=path.join(ROOT,"data/news-state.json");
  const news=JSON.parse(await readFile(newsFile,"utf8"));
  let state={};try{state=JSON.parse(await readFile(stateFile,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
  const result=await refreshNews(news,state);
  if(result.changed)await writeFile(newsFile,JSON.stringify(result.news,null,2)+"\n");
  await writeFile(stateFile,JSON.stringify(result.state,null,2)+"\n");
  for(const s of result.state.sources)if(s.status!=="ok")console.warn(s.organization+": "+s.status+" "+JSON.stringify(s.attempts??s.error));
  for(const e of result.errors)console.warn("Article pending retry: "+e.url+" "+e.error);
  console.log(JSON.stringify(result.state.last_run));
  console.log("Source coverage: "+result.state.sources.filter(s=>s.status==="ok").length+"/"+result.state.sources.length+" with candidates; failed links remain pending.");
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});
