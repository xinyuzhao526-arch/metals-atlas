import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEWS_FILE = path.join(ROOT, "data", "news.json");
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const decode = (value) => value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&nbsp;", " ");
const plain = (value) => decode(value.replace(/<[^>]+>/g, " ")).split(/\s+/).join(" ").trim();

export const sources = [
  { organization:"PLS Limited", metal:"li", strict:false, url:"https://www.pls.com/news", host:"pls.com" },
  { organization:"IGO Limited", metal:"li", strict:true, url:"https://www.igo.com.au/site/investor-center/ASX-Announcements", host:"igo.com.au" },
  { organization:"Mineral Resources", metal:"li", strict:true, url:"https://www.mineralresources.com.au/news/", host:"mineralresources.com.au" },
  { organization:"Rio Tinto", metal:"both", url:"https://www.riotinto.com/en/news/releases", host:"riotinto.com" },
  { organization:"Vale", metal:"ni", strict:true, url:"https://vale.com/en/newsroom", host:"vale.com" },
  { organization:"Glencore", metal:"ni", strict:true, url:"https://www.glencore.com/media-and-insights/news", host:"glencore.com" },
  { organization:"Eramet", metal:"ni", strict:true, url:"https://www.eramet.com/en/news/", host:"eramet.com" },
  { organization:"BHP", metal:"ni", strict:true, url:"https://www.bhp.com/news", host:"bhp.com" },
  { organization:"Ivanhoe Mines", metal:"cu", strict:true, url:"https://www.ivanhoemines.com/", host:"ivanhoemines.com" },
  { organization:"Freeport-McMoRan", metal:"cu", strict:false, url:"https://investors.fcx.com/investors/news-releases/", host:"investors.fcx.com" },
  { organization:"Antofagasta plc", metal:"cu", strict:false, url:"https://www.antofagasta.co.uk/investors/news/", host:"antofagasta.co.uk" },
  { organization:"MMG Limited", metal:"cu", strict:true, url:"https://www.mmg.com/investors/", host:"mmg.com" }
];

const copperWords = /(copper|kamoa|kakula|grasberg|freeport|collahuasi|pelambres|centinela|las bambas|teniente)/i;
const lithiumWords = /(lithium|spodumene|carbonate|hydroxide|pilgangoora|greenbushes|wodgina|marion|rincon|fenix|olaroz)/i;
const nickelWords = /\b(nickel|on[çc]a puma|voisey|sudbury|murrin murrin|weda bay|sorowako|nova|nickel west|western australia nickel)\b/i;
const supplyWords = /(production|guidance|output|operations?|restart|suspend|incident|expansion|project|mine|mineral resource|ore reserve|permit|quarter|annual|results?|产量|指引|停产|复产|扩建|储量)/i;
const excluded = /(careers?|privacy|contact|linkedin|facebook|instagram|subscribe|governance|board|dividend|share price)/i;

const mediaFeeds = [
  { organization:"Mining Technology", url:"https://www.mining-technology.com/feed/" },
  { organization:"The Northern Miner", url:"https://www.northernminer.com/feed/" },
  { organization:"Australian Mining", url:"https://www.australianmining.com.au/feed/" },
  { organization:"International Mining", url:"https://im-mining.com/feed/" },
  { organization:"MINING.COM", url:"https://www.mining.com/feed/" },
];
const paiPaiEventsUrl = "https://xinyuzhao526-arch.github.io/PaiPaiMetals/data/events.json";
const mediaMetals = {
  cu:/\b(copper|codelco|escondida|collahuasi|grasberg|las bambas|kamoa|centinela)\b|铜/i,
  li:/\b(lithium|spodumene|pilgangoora|greenbushes|wodgina|goulamina)\b|碳酸锂|锂辉石|氢氧化锂/i,
  ni:/\b(nickel|laterite|nornickel|ambatovy|saprolite|weda bay|sorowako|murrin murrin)\b|镍/i,
};
const eventInclude = /\b(halt(?:ed|s)?|suspend(?:ed|s|sion)?|shutdown|shut down|strike|stoppage|force majeure|curtail(?:ment)?|idle[ds]?|accident|fatal|collapse|fire|flood|blockade|landslide|disruption|outage|closure|restart(?:ed)?|resumes operations|guidance cut|production cuts?|expansion|expand(?:ing)?|ramp[- ]up|commission(?:ed|ing)?|first production|commercial production|acquir(?:e|es|ed|ing)|acquisition|merger|takeover|buys?|sells?|sold|sale of|divest(?:ment)?|stake|joint venture|offtake|supply agreement|export ban|export tax|export quota|royalty|tariff|sanction)\b|停产|停工|罢工|事故|减产|复产|扩产|投产|并购|收购|出售|股权|包销|长协|出口|关税|配额|监管/i;
const eventExclude = /\b(podcast|webinar|opinion|video|newsletter|npv|irr|feasibility study|scoping study|drilling|assay|private placement|funding|financing|loan facility|equipment|software|price forecast|market outlook|emissions|esg|climate|appointment|dividend|conference|award)\b|播客|视频|融资|募资|钻探|可研|估值|设备|价格预测|人事|任命/i;

export function classify(title, configuredMetal = "both", strict = false) {
  if (excluded.test(title) || !supplyWords.test(title)) return null;
  const copper = copperWords.test(title); const lithium = lithiumWords.test(title); const nickel = nickelWords.test(title);
  if (configuredMetal === "cu") return copper || (!strict && !lithium && !nickel) ? "cu" : null;
  if (configuredMetal === "li") return lithium || (!strict && !copper && !nickel) ? "li" : null;
  if (configuredMetal === "ni") return nickel || (!strict && !copper && !lithium) ? "ni" : null;
  if (copper && !lithium && !nickel) return "cu";
  if (lithium && !copper && !nickel) return "li";
  if (nickel && !copper && !lithium) return "ni";
  return null;
}

function absoluteUrl(href, base) {
  try { const url = new URL(decode(href), base); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid)/i.test(key)) url.searchParams.delete(key); return url.href; }
  catch { return null; }
}

function tagFor(text) {
  if (/halt|suspend|shutdown|strike|stoppage|accident|fatal|collapse|fire|flood|disruption|outage|closure|restart|停产|罢工|事故|减产|复产/i.test(text)) return "供给扰动";
  if (/expansion|expand|ramp|commission|first production|commercial production|扩产|投产/i.test(text)) return "扩产投产";
  if (/acquir|merger|takeover|buy|sell|sold|sale of|divest|stake|joint venture|并购|收购|出售|股权/i.test(text)) return "并购股权";
  if (/offtake|supply agreement|包销|长协/i.test(text)) return "长协包销";
  return "政策监管";
}

export function parseRssItems(xml, feed) {
  const rows = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const pick = (tag) => block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ?? "";
    const title = plain(pick("title").replace(/^<!\[CDATA\[|\]\]>$/g,""));
    const description = plain(pick("description").replace(/^<!\[CDATA\[|\]\]>$/g,""));
    const link = plain(pick("link").replace(/^<!\[CDATA\[|\]\]>$/g,""));
    const text = `${title} ${description}`;
    if (!title || !link || eventExclude.test(text) || !eventInclude.test(text)) continue;
    const metals = Object.entries(mediaMetals).filter(([,pattern]) => pattern.test(text)).map(([metal]) => metal);
    if (!metals.length) continue;
    const date = publishedDate(`<time datetime="${plain(pick("pubDate"))}"></time>`) ?? today();
    for (const metal of metals) rows.push({title,url:link,metal,date,organization:feed.organization,tag:tagFor(text)});
  }
  return rows;
}

async function scanMediaFeed(feed) { return parseRssItems(await fetchText(feed.url), feed); }

export function parsePaiPaiEvents(payload) {
  const allowed = new Map([["Cu","cu"],["Li","li"],["Ni","ni"]]);
  const rows = [];
  for (const event of payload?.events ?? []) {
    const url = event?.links?.[0]?.url;
    if (!event?.title || !event?.d || !url) continue;
    for (const symbol of event.metals ?? []) {
      const metal = allowed.get(symbol);
      if (metal) rows.push({title:event.title,url,metal,date:event.d,organization:event.src || "PaiPaiMetals media feed",tag:event.tag || "供给事件"});
    }
  }
  return rows;
}

async function scanPaiPaiEvents() { return parsePaiPaiEvents(JSON.parse(await fetchText(paiPaiEventsUrl))); }

export function parseOfficialLinks(html, source) {
  const found = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = plain(match[2]); const url = absoluteUrl(match[1], source.url);
    if (!url || !title || title.length < 12 || new URL(url).hostname.replace(/^www\./, "") !== source.host.replace(/^www\./, "")) continue;
    const metal = classify(title, source.metal, source.strict);
    if (metal) found.set(url, { title, url, metal });
  }
  return [...found.values()];
}

function publishedDate(html) {
  const candidates = [
    html.match(/property=["']article:published_time["'][^>]*content=["']([^"']+)/i)?.[1],
    html.match(/name=["']date["'][^>]*content=["']([^"']+)/i)?.[1],
    html.match(/<time[^>]*datetime=["']([^"']+)/i)?.[1],
  ].filter(Boolean);
  for (const candidate of candidates) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  }
  const visible = plain(html).match(/(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])/);
  return visible ? `${visible[1]}-${visible[2].padStart(2,"0")}-${visible[3].padStart(2,"0")}` : null;
}

async function fetchText(url) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, { headers:{ "user-agent":"MetalsAtlas official-news monitor (+https://github.com/xinyuzhao526-arch/metals-atlas)" }, signal:controller.signal });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

async function scanSource(source) {
  const html = await fetchText(source.url);
  return parseOfficialLinks(html, source).slice(0, 40).map((item) => ({ ...item, organization:source.organization }));
}

export async function main({ seed = process.argv.includes("--seed") } = {}) {
  const news = JSON.parse(await readFile(NEWS_FILE, "utf8"));
  const previousItemCount = news.items.length;
  const results = await Promise.allSettled(sources.map(scanSource));
  const mediaResults = await Promise.allSettled(mediaFeeds.map(scanMediaFeed));
  const paiPaiResult = await Promise.allSettled([scanPaiPaiEvents()]);
  const successes = results.filter((result) => result.status === "fulfilled");
  if (!successes.length && !mediaResults.some((result) => result.status === "fulfilled") && paiPaiResult[0].status === "rejected") throw new Error("Every news source failed; refusing to update state.");
  for (const [index, result] of results.entries()) if (result.status === "rejected") console.warn(`${sources[index].organization}: ${result.reason}`);
  const discovered = successes.flatMap((result) => result.value);
  const mediaSuccesses = mediaResults.filter((result) => result.status === "fulfilled");
  for (const [index, result] of mediaResults.entries()) if (result.status === "rejected") console.warn(`${mediaFeeds[index].organization}: ${result.reason}`);
  if (paiPaiResult[0].status === "rejected") console.warn(`PaiPaiMetals event pool: ${paiPaiResult[0].reason}`);
  const mediaDiscovered = [...new Map(mediaSuccesses.flatMap((result) => result.value).concat(paiPaiResult[0].status === "fulfilled" ? paiPaiResult[0].value : []).map((item) => [`${item.metal}:${item.url}`,item])).values()];
  const seen = new Set(news.seen_urls);
  const candidates = discovered.filter((item) => !seen.has(item.url));
  for (const item of discovered) seen.add(item.url);
  if (!seed) {
    for (const item of candidates.slice(0, 30)) {
      try {
        const article = await fetchText(item.url); const date = publishedDate(article);
        if (!date) { console.warn(`No publication date, skipped: ${item.url}`); continue; }
        news.items.push({
          id:`news-${item.metal}-${createHash("sha1").update(item.url).digest("hex").slice(0,16)}`,
          metal_id:`metal-${item.metal}`, title:item.title, organization:item.organization,
          source_type:"official_company_news", material_url:item.url, publication_date:date,
          effective_date:date, verification_date:today(), discovered_at:now(),
        });
      } catch (error) { console.warn(`Article failed: ${item.url}: ${error}`); }
    }
    for (const item of mediaDiscovered.filter((entry) => !seen.has(entry.url)).slice(0, 40)) {
      seen.add(item.url);
      news.items.push({
        id:`news-${item.metal}-${createHash("sha1").update(item.url).digest("hex").slice(0,16)}`,
        metal_id:`metal-${item.metal}`, title:item.title, organization:item.organization,
        source_type:"public_industry_media", source_level:"media", event_tag:item.tag,
        material_url:item.url, publication_date:item.date, effective_date:item.date,
        verification_date:today(), discovered_at:now(),
      });
    }
  }
  news.items = news.items.sort((a,b) => b.publication_date.localeCompare(a.publication_date)).slice(0, 100);
  news.seen_urls = [...seen].sort();
  const addedItems = news.items.length - previousItemCount;
  if (seed || addedItems > 0) {
    news.last_checked_at = now();
    if (addedItems > 0) news.updated_at = today();
    await writeFile(NEWS_FILE, `${JSON.stringify(news, null, 2)}\n`);
  }
  console.log(`Supply news check: official ${successes.length}/${sources.length}, media RSS ${mediaSuccesses.length}/${mediaFeeds.length}, PaiPai pool ${paiPaiResult[0].status}, ${candidates.length} unseen official links, ${addedItems} new items${seed ? " (seed only)" : ""}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
