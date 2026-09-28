import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
const INVENTORIES_FILE = path.join(DATA_DIR, "inventories.json");
const SOURCES_FILE = path.join(DATA_DIR, "sources.json");
const SHORT_TON_TO_METRIC_TONNE = 0.90718474;
const today = () => new Date().toISOString().slice(0, 10);
const round = (value, digits = 3) => Number(value.toFixed(digits));
const number = (value) => Number(String(value).replaceAll(",", ""));

function assertPlausible(value, label, low = 1, high = 5_000_000) {
  if (!Number.isFinite(value) || value < low || value > high) throw new Error(`${label} failed plausibility check: ${value}`);
}
function decodeHtml(value) { return value.replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'"); }
function textFromHtml(value) { return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
async function fetchText(url, { allowNotFound = false } = {}) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, { headers: { "user-agent": "MetalsAtlas inventory updater (+https://github.com/xinyuzhao526-arch/metals-atlas)" }, signal: controller.signal });
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}

export function parseComexRows(html) {
  const rows = [];
  const pattern = /<tr[^>]*data-registered="([\d.]+)"[^>]*data-eligible="([\d.]+)"[^>]*data-total="([\d.]+)"[^>]*data-change="([-\d.]+)"[^>]*data-reg-change="([-\d.]+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const match of html.matchAll(pattern)) {
    const date = match[6].match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (date) rows.push({ date, registered: number(match[1]), eligible: number(match[2]), total: number(match[3]), totalChange: number(match[4]), registeredChange: number(match[5]) });
  }
  if (!rows.length) throw new Error("COMEX page contained no dated warehouse rows");
  for (const row of rows) {
    assertPlausible(row.total, `COMEX total ${row.date}`);
    if (row.registered + row.eligible !== row.total) throw new Error(`COMEX components do not reconcile on ${row.date}`);
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
function copperSection(html) {
  const marker = '<div class="cell">铜</div>'; const start = html.indexOf(marker);
  if (start < 0) throw new Error("SHFE report has no copper section");
  const end = html.indexOf("special_row_type", start + marker.length);
  return textFromHtml(html.slice(start, end < 0 ? undefined : end));
}
export function parseShfeDaily(html) {
  const date = textFromHtml(html).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const match = copperSection(html).match(/(?:^|\s)总计\s+([\d,]+)\s+([-\d,]+)/);
  if (!date || !match) throw new Error("SHFE daily copper total could not be parsed");
  const value = number(match[1]); const change = number(match[2]); assertPlausible(value, `SHFE warehouse warrants ${date}`, 0);
  return { date, value, change };
}
export function parseShfeWeekly(html) {
  const date = textFromHtml(html).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const match = copperSection(html).match(/(?:^|\s)总计\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([-\d,]+)\s+([-\d,]+)/);
  if (!date || !match) throw new Error("SHFE weekly copper total could not be parsed");
  const result = { date, previousInventory: number(match[1]), previousWarrants: number(match[2]), inventory: number(match[3]), warrants: number(match[4]) };
  assertPlausible(result.inventory, `SHFE weekly inventory ${date}`, 0); return result;
}
export function parseLmeSnapshot(html) {
  const description = decodeHtml(html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ?? "");
  const match = description.match(/As of ([A-Za-z]+ \d{1,2}, \d{4}), London Metal Exchange Copper total warehouse stocks stands at ([\d.]+)K mt\. It has (increased|decreased) by ([\d.]+)% over the past 30 days/i);
  if (!match) throw new Error("LME public snapshot description could not be parsed");
  const parsedDate = new Date(`${match[1]} 00:00:00 UTC`); const value = number(match[2]) * 1000;
  if (Number.isNaN(parsedDate.valueOf())) throw new Error(`Invalid LME date: ${match[1]}`); assertPlausible(value, "LME total stocks");
  return { date: parsedDate.toISOString().slice(0, 10), value, change30dPct: round(number(match[4]) * (match[3].toLowerCase() === "decreased" ? -1 : 1), 2) };
}

function fact({ id, exchange, type, value, originalUnit, normalizedValue, date, sourceId, tier, frequency, changePct, changePeriod, notes, license }) {
  return { id, exchange, inventory_type: type, value, original_unit: originalUnit, normalized_value: normalizedValue, normalized_unit: "metric_tonnes", data_date: date, published_at: date, source_id: sourceId, source_tier: tier, frequency, change_pct: changePct, change_period: changePeriod, notes, license_status: license, missing_reason: null };
}
function upsert(items, record) {
  const index = items.findIndex((item) => item.id === record.id);
  if (index < 0) items.push(record);
  else {
    if (items[index].verification_date && record.verification_date) record.verification_date = items[index].verification_date;
    items[index] = record;
  }
}
function source({ id, tier, type, organization, title, date, url, locator }) {
  return { id, tier, source_type: type, organization, title, publication_date: date, verification_date: today(), url, locator, short_excerpt: null };
}
function pct(change, current) {
  const previous = current - change;
  return previous > 0 ? round((change / previous) * 100, 2) : null;
}

async function updateComex(inventories, sources) {
  const url = "https://www.meiyuanhuanliu.com/copper_stocks/";
  const rows = parseComexRows(await fetchText(url));
  const latestKnown = inventories.items.filter((item) => item.exchange === "COMEX" && item.inventory_type === "total" && item.data_date).map((item) => item.data_date).sort().at(-1) ?? "0000-00-00";
  const newRows = rows.filter((row) => row.date > latestKnown).sort((a, b) => a.date.localeCompare(b.date));
  for (const row of newRows) {
    const sourceId = `src-meiyuanhuanliu-comex-copper-${row.date}`;
    upsert(sources.items, source({ id: sourceId, tier: "B", type: "secondary_warehouse_report_republication", organization: "美元环流（转录 CME Copper Stocks 报告）", title: `COMEX 铜仓库库存 ${row.date}`, date: row.date, url, locator: `HTML ${row.date} 行；registered ${row.registered}、eligible ${row.eligible}、total ${row.total} short tons。官方报告入口：https://www.cmegroup.com/delivery_reports/Copper_Stocks.xls` }));
    const eligibleChange = row.totalChange - row.registeredChange;
    const definitions = [
      ["registered", row.registered, row.registeredChange, "Registered 为已注册可交割库存"],
      ["eligible", row.eligible, eligibleChange, "Eligible 为符合规格但未注册为交割仓单的库存"],
      ["total", row.total, row.totalChange, "Registered + Eligible；不得与 SHFE 或 LME 直接相加"],
    ];
    for (const [type, value, change, definition] of definitions) upsert(inventories.items, fact({
      id: `inventory-comex-${type}-${row.date}`, exchange: "COMEX", type, value, originalUnit: "short_tons",
      normalizedValue: round(value * SHORT_TON_TO_METRIC_TONNE), date: row.date, sourceId, tier: "B", frequency: "daily",
      changePct: pct(change, value), changePeriod: "previous_report",
      notes: `${definition}；较上一报告 ${change >= 0 ? "+" : ""}${change} short tons。按 1 short ton = 0.90718474 metric tonnes 标准化。`,
      license: "secondary_republication_cc_by_nc_4_0_official_download_blocked",
    }));
  }
  return newRows.length;
}
function datesBackFrom(isoDate, days) {
  const dates = []; const date = new Date(`${isoDate}T00:00:00Z`);
  for (let index = 0; index <= days; index += 1) { dates.push(date.toISOString().slice(0, 10)); date.setUTCDate(date.getUTCDate() - 1); }
  return dates;
}
async function firstShfeReport(kind, dates) {
  for (const date of dates) {
    const url = `https://www.shfe.com.cn/data/tradedata/future/stockdata/${kind}_${date.replaceAll("-", "")}/ZH/all.html`;
    const html = await fetchText(url, { allowNotFound: true });
    if (html) return { html, url };
  }
  throw new Error(`No recent SHFE ${kind} report was found`);
}

async function updateShfe(inventories, sources) {
  const list = JSON.parse(await fetchText("https://www.shfe.com.cn/data/tradedata/future/dailydata/stock_data_list.dat"));
  const dates = JSON.parse(list.dataList).map(String).sort().reverse();
  if (!dates.length) throw new Error("SHFE stock report date list is empty");
  const latest = `${dates[0].slice(0, 4)}-${dates[0].slice(4, 6)}-${dates[0].slice(6, 8)}`;
  const candidates = datesBackFrom(latest, 14);
  const [dailyReport, weeklyReport] = await Promise.all([firstShfeReport("dailystock", candidates), firstShfeReport("weeklystock", candidates)]);
  const daily = parseShfeDaily(dailyReport.html); const weekly = parseShfeWeekly(weeklyReport.html);
  const dailySourceId = `src-shfe-daily-warrant-${daily.date}`;
  upsert(sources.items, source({
    id: dailySourceId, tier: "A", type: "official_daily_warehouse_warrant_report", organization: "上海期货交易所",
    title: `上海期货交易所仓单日报 ${daily.date}`, date: daily.date, url: dailyReport.url,
    locator: `HTML 铜 / 总计：期货（已制成仓单）${daily.value} 吨，较上一报告 ${daily.change >= 0 ? "+" : ""}${daily.change} 吨`,
  }));
  upsert(inventories.items, fact({
    id: `inventory-shfe-warehouse-warrants-${daily.date}`, exchange: "SHFE", type: "warehouse_warrants", value: daily.value,
    originalUnit: "metric_tonnes", normalizedValue: daily.value, date: daily.date, sourceId: dailySourceId, tier: "A", frequency: "daily",
    changePct: pct(daily.change, daily.value), changePeriod: "previous_report",
    notes: `上期所官方仓单日报铜“期货”总计；较上一报告 ${daily.change >= 0 ? "+" : ""}${daily.change} 吨。不等同于库存周报。`, license: "official_public_report",
  }));
  const weeklySourceId = `src-shfe-weekly-inventory-${weekly.date}`;
  upsert(sources.items, source({
    id: weeklySourceId, tier: "A", type: "official_weekly_inventory_report", organization: "上海期货交易所",
    title: `上海期货交易所库存周报 ${weekly.date}`, date: weekly.date, url: weeklyReport.url,
    locator: `HTML 铜 / 总计：上周库存 ${weekly.previousInventory} 吨，本周库存 ${weekly.inventory} 吨；本周期货仓单 ${weekly.warrants} 吨`,
  }));
  upsert(inventories.items, fact({
    id: `inventory-shfe-weekly-${weekly.date}`, exchange: "SHFE", type: "weekly_inventory", value: weekly.inventory,
    originalUnit: "metric_tonnes", normalizedValue: weekly.inventory, date: weekly.date, sourceId: weeklySourceId, tier: "A", frequency: "weekly",
    changePct: pct(weekly.inventory - weekly.previousInventory, weekly.inventory), changePeriod: "week_over_week",
    notes: `上期所官方库存周报铜总库存；上周 ${weekly.previousInventory} 吨、本周 ${weekly.inventory} 吨。不等同于仓单日报。`, license: "official_public_report",
  }));
  inventories.items = inventories.items.filter((item) => item.id !== "inventory-shfe-warrant-pending");
  return 2;
}

async function updateLme(inventories, sources) {
  const url = "https://thevaultreport.com/charts/lme/copper";
  const snapshot = parseLmeSnapshot(await fetchText(url)); const id = `inventory-lme-total-${snapshot.date}`;
  const exists = inventories.items.some((item) => item.id === id);
  if (!exists) {
    const sourceId = `src-vaultreport-lme-copper-${snapshot.date}`;
    upsert(sources.items, source({ id: sourceId, tier: "B", type: "media_relay_daily_snapshot", organization: "The Vault Report（转述 LME 报告）", title: `LME Copper Warehouse Inventory ${snapshot.date}`, date: snapshot.date, url, locator: `HTML meta description / latest snapshot：total warehouse stocks ${snapshot.value} metric tonnes；30 日变化 ${snapshot.change30dPct}%` }));
    upsert(inventories.items, fact({
      id, exchange: "LME", type: "total", value: snapshot.value, originalUnit: "metric_tonnes", normalizedValue: snapshot.value,
      date: snapshot.date, sourceId, tier: "B", frequency: "daily", changePct: snapshot.change30dPct, changePeriod: "30_day",
      notes: "公开页面对 LME 官方仓库报告的当日总库存转述；仅逐日保存实际观察快照，不批量复制受限历史，不推算缺失日期。",
      license: "media_relay_observed_daily_snapshot",
    }));
  }
  for (const item of inventories.items.filter((record) => record.exchange === "LME" && record.inventory_type === "total" && record.value !== null)) {
    item.frequency = "daily"; item.license_status = "media_relay_observed_daily_snapshot";
    item.notes = "公开页面对 LME 官方仓库报告的当日总库存转述；逐日保存实际观察快照，不批量复制受限历史，不推算缺失日期。";
  }
  return exists ? 0 : 1;
}
export async function main() {
  const inventories = JSON.parse(await readFile(INVENTORIES_FILE, "utf8")); const sources = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
  const inventoryBefore = JSON.stringify(inventories.items);
  const sourcesBefore = JSON.stringify(sources.items);
  const results = await Promise.allSettled([updateShfe(inventories, sources), updateComex(inventories, sources), updateLme(inventories, sources)]);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    for (const failure of failures) console.error(failure.reason);
    throw new Error(`${failures.length} inventory source(s) failed; refusing a partial write`);
  }
  if (JSON.stringify(inventories.items) !== inventoryBefore) inventories.updated_at = today();
  if (JSON.stringify(sources.items) !== sourcesBefore) sources.updated_at = today();
  await writeFile(INVENTORIES_FILE, `${JSON.stringify(inventories, null, 2)}\n`); await writeFile(SOURCES_FILE, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Inventory refresh complete: SHFE ${results[0].value}, COMEX ${results[1].value}, LME ${results[2].value}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
