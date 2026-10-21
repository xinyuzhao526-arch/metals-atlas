import type { PublicProject, PublicSource } from "./public-data";
import dataset from "../data/tin-iron.json" with { type: "json" };

export type SupplyMetric = "production" | "shipments" | "guidance" | "reserve" | "resource";
export type MissingReason = { code: string; detail: string };
export type SupplyFact = {
  source_code: string; record_key: string; project_id: string; metric: SupplyMetric;
  value: number | null; upper: number | null; unit: string;
  period: { start: string; end: string; type: "quarter" | "annual" | "ytd" | "as_of"; label: string; calendar_basis: "calendar" | "fiscal" };
  production_stage: string; ownership_basis: string; effective_date: string;
  source_id: string; source_publication_date: string; verification_date: string;
  missing_reason: MissingReason | null; note: string;
};
export type SupplyAsset = {
  id: string; name: string; country: string; iso3: string; region: string;
  latitude: number; longitude: number; operator: string; ownership: string;
  stage: string; product: string; status: "operating" | "development" | "suspended";
  profile_source_id: string; profile_as_of: string; summary: string;
};
export type SupplyEvent = { id: string; projectId: string; date: string; kind: string; headline: string; summary: string; sourceId: string };
export type StockPoint = { id: string; source_code: string; record_key: string; value: number | null; data_date: string; source_id: string; source_publication_date: string; production_stage: string; effective_date: string; verification_date: string; missing_reason: MissingReason | null };
export type StockChannel = { id: string; name: string; definition: string; unit: string; product: string; source_url: string | null; missing_reason: MissingReason | null; points: StockPoint[] };
export type SupplyConfig = { slug: "tin" | "iron"; metal: "sn" | "fe"; symbol: string; name: string; english: string; scope: string; thesis: string; updated: string; sources: PublicSource[]; projects: SupplyAsset[]; facts: SupplyFact[]; events: SupplyEvent[]; stocks: StockChannel[]; chain: { title: string; description: string }[] };
export const tinConfig = dataset.tin as SupplyConfig;
export const ironConfig = dataset.iron as SupplyConfig;
export const missingFact: MissingReason = { code: "not_recorded", detail: "本批尚未录入独立可核验事实" };

export function assetFacts(c: SupplyConfig, id: string, metric: SupplyMetric, type?: SupplyFact["period"]["type"]) {
  return c.facts.filter(f => f.project_id === id && f.metric === metric && (!type || f.period.type === type)).sort((a,b) => b.period.end.localeCompare(a.period.end));
}
export function latestFact(c: SupplyConfig, id: string, metric: SupplyMetric, type?: SupplyFact["period"]["type"]) {
  return assetFacts(c, id, metric, type)[0];
}
export function filterAssets(c: SupplyConfig, filters: {search: string; country: string; coverage: string; sort: string}) {
  return c.projects.filter(p => {
    const q = filters.search.trim().toLowerCase();
    if (q && !(p.name+" "+p.operator+" "+p.country).toLowerCase().includes(q)) return false;
    if (filters.country !== "all" && filters.country !== p.iso3) return false;
    if (filters.coverage === "event") return c.events.some(e => e.projectId === p.id);
    return filters.coverage === "all" || c.facts.some(f => f.project_id === p.id && f.metric === filters.coverage && f.value !== null);
  }).sort((a,b) => filters.sort === "country" ? a.country.localeCompare(b.country,"zh-CN") : filters.sort === "name" ? a.name.localeCompare(b.name) : b.profile_as_of.localeCompare(a.profile_as_of));
}
export function exportFacts(c: SupplyConfig, ids: string[]) {
  return c.facts.filter(f => ids.includes(f.project_id)).map(f => {
    const p = c.projects.find(p => p.id === f.project_id)!;
    const s = c.sources.find(s => s.id === f.source_id)!;
    return { project_id:p.id, project:p.name, country:p.country, operator:p.operator, metric:f.metric, value:f.value, upper:f.upper, unit:f.unit, period_start:f.period.start, period_end:f.period.end, period_type:f.period.type, calendar_basis:f.period.calendar_basis, production_stage:f.production_stage, ownership_basis:f.ownership_basis, effective_date:f.effective_date, source_code:f.source_code, record_key:f.record_key, missing_reason:f.missing_reason ? JSON.stringify(f.missing_reason) : null, note:f.note, source_organization:s.organization, source_title:s.title, source_url:s.url, source_type:s.source_type, source_publication_date:s.publication_date, verification_date:s.verification_date };
  });
}
export function toMapProject(c: SupplyConfig, p: SupplyAsset): PublicProject {
  return { id:p.id, slug:p.id, name:p.name, metal_id:c.metal, country:{iso3:p.iso3,name_zh:p.country,name_en:p.country}, region:p.region, status:p.status, operation_type:p.stage, production_stage:p.stage, primary_product:p.product, operator:p.operator, operator_source_id:p.profile_source_id, operator_missing_reason:null, location:{latitude:p.latitude,longitude:p.longitude,precision:"approximate",source_id:p.profile_source_id,locator:"按报告所述区域人工标注，仅保留 0.1 度",basis:"区域近似中心；非测量点、矿权、设施或运输路线边界。"}, ownership:[], profile_source_id:p.profile_source_id, ownership_source_id:p.profile_source_id, verified_at:c.updated };
}
