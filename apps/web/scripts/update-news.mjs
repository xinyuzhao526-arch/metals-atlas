import { readFile, writeFile } from "node:fs/promises";
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
  { organization:"Ivanhoe Mines", metal:"cu", strict:true, url:"https://www.ivanhoemines.com/", host:"ivanhoemines.com" },
  { organization:"Freeport-McMoRan", metal:"cu", strict:false, url:"https://investors.fcx.com/investors/news-releases/", host:"investors.fcx.com" },
  { organization:"Antofagasta plc", metal:"cu", strict:false, url:"https://www.antofagasta.co.uk/investors/news/", host:"antofagasta.co.uk" },
  { organization:"MMG Limited", metal:"cu", strict:true, url:"https://www.mmg.com/investors/", host:"mmg.com" }
];

const copperWords = /(copper|kamoa|kakula|grasberg|freeport|collahuasi|pelambres|centinela|las bambas|teniente)/i;
const lithiumWords = /(lithium|spodumene|carbonate|hydroxide|pilgangoora|greenbushes|wodgina|marion|rincon|fenix|olaroz)/i;
const supplyWords = /(production|guidance|output|operations?|restart|suspend|incident|expansion|project|mine|mineral resource|ore reserve|permit|quarter|annual|results?|产量|指引|停产|复产|扩建|储量)/i;
const excluded = /(careers?|privacy|contact|linkedin|facebook|instagram|subscribe|governance|board|dividend|share price)/i;

export function classify(title, configuredMetal = "both", strict = false) {
  if (excluded.test(title) || !supplyWords.test(title)) return null;
  const copper = copperWords.test(title); const lithium = lithiumWords.test(title);
  if (configuredMetal === "cu") return copper || (!strict && !lithium) ? "cu" : null;
  if (configuredMetal === "li") return lithium || (!strict && !copper) ? "li" : null;
  if (copper && !lithium) return "cu";
  if (lithium && !copper) return "li";
  return null;
}

function absoluteUrl(href, base) {
  try { const url = new URL(decode(href), base); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid)/i.test(key)) url.searchParams.delete(key); return url.href; }
  catch { return null; }
}

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
  const successes = results.filter((result) => result.status === "fulfilled");
  if (!successes.length) throw new Error("Every official news source failed; refusing to update state.");
  for (const [index, result] of results.entries()) if (result.status === "rejected") console.warn(`${sources[index].organization}: ${result.reason}`);
  const discovered = successes.flatMap((result) => result.value);
  const seen = new Set(news.seen_urls);
  const candidates = discovered.filter((item) => !seen.has(item.url));
  for (const item of discovered) seen.add(item.url);
  if (!seed) {
    for (const item of candidates.slice(0, 30)) {
      try {
        const article = await fetchText(item.url); const date = publishedDate(article);
        if (!date) { console.warn(`No publication date, skipped: ${item.url}`); continue; }
        news.items.push({
          id:`news-${item.metal}-${Buffer.from(item.url).toString("base64url").slice(0,18)}`,
          metal_id:item.metal === "cu" ? "metal-cu" : "metal-li", title:item.title, organization:item.organization,
          source_type:"official_company_news", material_url:item.url, publication_date:date,
          effective_date:date, verification_date:today(), discovered_at:now(),
        });
      } catch (error) { console.warn(`Article failed: ${item.url}: ${error}`); }
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
  console.log(`Official news check: ${successes.length}/${sources.length} sources available, ${candidates.length} unseen links, ${addedItems} new published items${seed ? " (seed only)" : ""}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
