import assert from "node:assert/strict";
import test from "node:test";
import { classify, classifyMetals, parseOfficialLinks, parsePaiPaiEvents, parseRssItems, publishedDate, articleDate, articleBody, refreshNews, fetchText } from "../scripts/update-news.mjs";

const now=new Date("2026-10-21T12:00:00Z");
const empty=()=>({schema_version:"1.0.0",updated_at:"2026-10-20",seen_urls:[],items:[]});
const source=(metals=["sn"])=>({id:"company",organization:"Company",metals,reportMetals:metals,source_type:"official_company_news",endpoints:[{url:"https://company.test/news",kind:"html"}]});
const article=(date="2026-10-20",body="Tin production increased.")=>'<meta content="'+date+'" property="article:published_time"><main>'+body+"</main>";
const options=(fetcher,more={})=>({now,fetcher,sources:[source()],mediaFeeds:[],eventFeed:false,...more});

test("all eight metals are recognized without treating the verb lead as lead metal",()=>{
  for(const [title,metal] of [["Kamoa copper production","cu"],["Pilgangoora lithium production","li"],["Weda Bay nickel production","ni"],["Worsley alumina production","al"],["Bisie tin production","sn"],["WAIO iron ore production","fe"],["Red Dog zinc production","zn"],["Cannington lead production","pb"]]){
    assert.equal(classify(title,metal,true),metal);
  }
  assert.equal(classify("Quarterly nickel production results","li",true),null);
  assert.equal(classify("Open innovation project results","ni",true),null);
  assert.equal(classify("Board dividend announcement","cu"),null);
  assert.deepEqual(classifyMetals("Copper mine expands to lead global supply"),["cu"]);
  assert.equal(classify("Alphamin declares dividend / Q3 guidance / exploration update","sn"),"sn");
});
test("group operational reports can be candidates for several metals, subject to body confirmation",()=>{
  assert.deepEqual(classifyMetals("Third quarter production results",source(["cu","fe"])),["cu","fe"]);
  const html='<a href="/q3">Third quarter production results</a>';
  assert.ok(parseOfficialLinks(html,{...source(["cu","fe"]),url:"https://company.test/news"}).every(x=>x.needs_body_metals));
});
test("RSS/Atom retain dated supply events, decode titles and exclude financing, equipment and price commentary",()=>{
  const items=[
    ["Copper mine suspends production after accident","copper-stop","Wed, 07 Oct 2026 08:00:00 GMT"],
    ["Tin production guidance increased","tin","Tue, 20 Oct 2026 08:00:00 GMT"],
    ["Iron ore shipments increase","iron","Tue, 20 Oct 2026 08:00:00 GMT"],
    ["Lithium price forecast and market outlook","price","Tue, 20 Oct 2026 08:00:00 GMT"],
    ["Nickel developer completes private placement for expansion","funding","Tue, 20 Oct 2026 08:00:00 GMT"],
    ["JOEST bags equipment order for Pilgangoora expansion","equipment","Tue, 20 Oct 2026 08:00:00 GMT"],
  ];
  const xml="<rss>"+items.map(([t,u,d])=>"<item><title>"+t+"</title><link>https://media.test/"+u+"</link><pubDate>"+d+"</pubDate></item>").join("")+"</rss>";
  assert.deepEqual(parseRssItems(xml,{organization:"Media"}).map(i=>i.metal),["cu","sn","fe"]);
  const atom='<feed><entry><title>Tin&#8217;s production update</title><link href="https://media.test/atom"/><published>2026-10-20T23:30:00-07:00</published></entry></feed>';
  const parsed=parseRssItems(atom,{organization:"Media"});
  assert.equal(parsed[0].title,"Tin’s production update");
  assert.equal(parsed[0].date,"2026-10-20");
});
test("PaiPai supports tin, iron and combined zinc/lead and preserves media provenance",()=>{
  const rows=parsePaiPaiEvents({events:[{title:"Mine suspended",d:"2026-10-20",metals:["Cu","Fe","Sn","PbZn"],src:"Publisher",links:[{url:"https://media.test/mine"}]}]});
  assert.deepEqual(rows.map(i=>i.metal),["cu","fe","sn","pb","zn"]);
  assert.ok(rows.every(i=>i.organization==="Publisher"&&i.tag==="供给扰动"));
});
test("official links reject foreign hosts, support accessible link labels and keep issuer listing dates",()=>{
  const html='<a href="/news/one">Pilgangoora quarterly lithium production results</a><a href="https://other.test/story">Lithium production results</a><a href="/q2" aria-label="Quarterly lithium production report">Read more</a>';
  assert.equal(parseOfficialLinks(html,{...source(["li"]),url:"https://company.test/news"}).length,2);
  const table='<table><tr><td>19 Oct 2026</td><td><a href="/report">Quarterly production report</a></td></tr></table>';
  assert.equal(parseOfficialLinks(table,{...source(),url:"https://company.test/news"})[0].date,"2026-10-19");
});
test("publisher calendar dates do not shift with timezone; reporting-period and related-story dates are not publication dates",()=>{
  assert.equal(publishedDate("19 Oct 2026"),"2026-10-19");
  assert.equal(publishedDate("20 October, 2026"),"2026-10-20");
  assert.equal(publishedDate("2026-10-20T00:00:00+08:00"),"2026-10-20");
  assert.equal(publishedDate("2026-02-30"),null);
  assert.equal(articleDate("<h1>Quarter ended 30 September 2026</h1>"),null);
  assert.equal(articleDate('<div class="pr-date"><p>20 October, 2026</p></div>'),"2026-10-20");
  assert.equal(articleDate('<p class="article-date">July 23, 2026</p><time>October 7, 2026</time>'),"2026-07-23");
});
test("legacy seen URLs cannot suppress unsuccessful imports; reruns are idempotent per metal and URL",async()=>{
  const initial=empty();initial.seen_urls=["https://company.test/story"];
  const fetcher=async url=>url.endsWith("/news")?'<a href="/story">Tin production results</a>':article();
  const first=await refreshNews(initial,{},options(fetcher));
  assert.equal(first.news.items.length,1);assert.equal(first.state.pending.length,0);
  assert.equal(first.news.items[0].effective_date,null);
  assert.ok(first.news.items[0].effective_date_missing_reason);
  assert.equal(first.news.items[0].source_level,"official");
  const second=await refreshNews(first.news,first.state,options(fetcher));
  assert.equal(second.changed,false);assert.equal(second.news.items.length,1);
});
test("article extraction reaches the press release past breadcrumbs and excludes RNS related stories",()=>{
  assert.ok(articleBody('<main><article>Press releases 2026</article><div class="pr-date">20 October, 2026</div><p>Copper production increased.</p></main>').includes("Copper production"));
  assert.ok(articleBody('<main><article></article><p>Zinc production increased.</p></main>').includes("Zinc production"));
  const rns='<div class="fr-view-element"><div>Copper production</div><p>Iron ore output</p></div><div>Related: Nickel production</div>';
  assert.ok(articleBody(rns).includes("Iron ore"));assert.ok(!articleBody(rns).includes("Nickel"));
});
test("an article failure stays pending and is imported after recovery rather than marked as processed",async()=>{
  const listing='<a href="/story">Tin production results</a>';
  const first=await refreshNews(empty(),{},options(async url=>{if(url.endsWith("/news"))return listing;throw new Error("HTTP 503");}));
  assert.equal(first.state.processed_keys.length,0);
  assert.equal(first.state.pending.length,1);
  const second=await refreshNews(first.news,first.state,options(async url=>url.endsWith("/news")?listing:article(),{now:new Date("2026-10-21T16:00:00Z")}));
  assert.equal(second.news.items.length,1);assert.equal(second.state.pending.length,0);
});
test("detail budgets defer untouched candidates without losing them",async()=>{
  const listing='<a href="/one">Tin production update one</a><a href="/two">Tin production update two</a>';
  const fetcher=async url=>url.endsWith("/news")?listing:article();
  const first=await refreshNews(empty(),{},options(fetcher,{articleLimit:1}));
  assert.equal(first.news.items.length,1);assert.equal(first.state.pending.length,1);assert.equal(first.state.pending[0].attempts,0);
  const second=await refreshNews(first.news,first.state,options(fetcher,{articleLimit:1}));
  assert.equal(second.news.items.length,2);assert.equal(second.state.pending.length,0);
});
test("multi-metal report imports both affected metals and excludes AI summaries from body classification",async()=>{
  const html='<div id="accordionSummary">Nickel production</div><div class="fr-view-element"><p>Copper and iron ore production increased.</p></div>';
  assert.ok(!articleBody(html).includes("Nickel"));
  const fetcher=async url=>url.endsWith("/news")?'<tr><td>20 Oct 2026</td><td><a href="/report">Quarterly production report</a></td></tr>':html;
  const result=await refreshNews(empty(),{},options(fetcher,{sources:[source(["cu","ni","fe"])]}));
  assert.deepEqual(new Set(result.news.items.map(i=>i.metal_id)),new Set(["metal-cu","metal-fe"]));
});
test("missing RSS dates never default to the collection date",async()=>{
  const feed={id:"rss",organization:"Media",endpoints:[{url:"https://media.test/feed",kind:"rss"}]};
  const result=await refreshNews(empty(),{},options(async url=>url.endsWith("feed")?'<rss><item><title>Tin production update</title><link>https://media.test/story</link></item></rss>':"<h1>Tin production update</h1>",{sources:[],mediaFeeds:[feed]}));
  assert.equal(result.news.items.length,0);assert.equal(result.state.pending.length,1);
});
test("retention is per metal and new articles are saved even when the retained count is full",async()=>{
  const news=empty();
  news.items=[{id:"old",metal_id:"metal-sn",title:"Old tin production",material_url:"https://company.test/old",publication_date:"2026-10-01",source_type:"official_company_news"}];
  const result=await refreshNews(news,{},options(async url=>url.endsWith("/news")?'<a href="/new">New tin production update</a>':article(),{perMetalLimit:1}));
  assert.equal(result.changed,true);assert.equal(result.news.items.length,1);assert.equal(result.news.items[0].title,"New tin production update");
});
test("source fallback records failures and a successful alternate endpoint",async()=>{
  const config={...source(),endpoints:[{url:"https://company.test/broken",kind:"html"},{url:"https://company.test/news",kind:"html"}]};
  const result=await refreshNews(empty(),{},options(async url=>{if(url.endsWith("broken"))throw new Error("HTTP 404");return url.endsWith("/news")?'<a href="/story">Tin production results</a>':article();},{sources:[config]}));
  assert.equal(result.state.sources[0].status,"ok");
  assert.deepEqual(result.state.sources[0].attempts.map(a=>a.status),["error","ok"]);
});
test("identical quarterly report titles from different issuers remain separate records",async()=>{
  const configs=[source(["cu"]),{...source(["cu"]),id:"other",organization:"Other Company",endpoints:[{url:"https://other.test/news",kind:"html"}]}];
  const result=await refreshNews(empty(),{},options(async url=>url.endsWith("/news")?'<a href="/report">Third quarter production results</a>':article("2026-10-20","Copper production"),{sources:configs}));
  assert.equal(result.news.items.length,2);
  assert.ok(result.news.items.every(i=>i.review_status==="pending"&&i.verification_method==="automated_metadata_check"));
});
test("all-source failure preserves existing input and surfaces a failing run",async()=>{
  const input=empty(),copy=structuredClone(input);
  await assert.rejects(refreshNews(input,{},options(async()=>{throw new Error("HTTP 503");})),/Every news source failed/);
  assert.deepEqual(input,copy);
});
test("transient HTTP failures retry, while forbidden responses do not get hammered",async()=>{
  let calls=0;const response=status=>({ok:status===200,status,headers:new Headers({"content-type":"text/html"}),text:async()=>"ok"});
  assert.equal(await fetchText("https://source.test",{wait:async()=>{},fetchImpl:async()=>response(++calls===1?503:200)}),"ok");
  assert.equal(calls,2);calls=0;
  await assert.rejects(fetchText("https://source.test",{wait:async()=>{},fetchImpl:async()=>{calls++;return response(403);}}),/HTTP 403/);
  assert.equal(calls,1);
});
