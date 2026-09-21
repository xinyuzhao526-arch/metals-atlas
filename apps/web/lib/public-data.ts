import coverageJson from "@/data/coverage.json";
import eventsJson from "@/data/events.json";
import guidanceJson from "@/data/guidance.json";
import inventoriesJson from "@/data/inventories.json";
import productionJson from "@/data/production.json";
import projectsJson from "@/data/projects.json";
import reservesJson from "@/data/reserves.json";
import sourcesJson from "@/data/sources.json";

export type PublicSource = {
  id: string;
  tier: "A" | "B";
  source_type: string;
  organization: string;
  title: string;
  publication_date: string | null;
  verification_date: string;
  url: string;
  locator: string;
  short_excerpt: string | null;
};

export type PublicProject = {
  id: string;
  slug: string;
  name: string;
  metal_id: string;
  country: { iso3: string; name_zh: string; name_en: string };
  region: string | null;
  status: "operating" | "development" | "suspended" | "closed" | "unknown";
  operation_type: string;
  production_stage: string;
  primary_product: string;
  operator: string | null;
  operator_source_id: string | null;
  operator_missing_reason: string | null;
  location: {
    latitude: number | null;
    longitude: number | null;
    precision: "exact" | "approximate" | "country_only" | "pending";
    source_id: string | null;
    locator: string | null;
    basis: string | null;
  };
  ownership: Array<{ company: string; ownership_pct: number }>;
  profile_source_id: string | null;
  ownership_source_id: string | null;
  verified_at: string;
};

export type ProductionFact = {
  id: string;
  observation_id: string;
  project_id: string;
  metal_id: string;
  value: number | null;
  unit: string;
  missing_reason: string | null;
  period: { start: string; end: string; type: string; label: string };
  calendar_basis: string;
  production_stage: string;
  ownership_basis: string;
  effective_date: string;
  source_id: string;
};

export type GuidanceFact = {
  id: string;
  observation_id: string;
  project_id: string;
  metal_id: string;
  low: number | null;
  high: number | null;
  unit: string;
  missing_reason: string | null;
  period: { start: string; end: string; type: string; label: string };
  calendar_basis: string;
  production_stage: string;
  ownership_basis: string;
  guidance_kind: string;
  effective_date: string;
  source_id: string;
};

export type ReserveFact = {
  id: string;
  observation_id: string;
  project_id: string;
  metal_id: string;
  ore_tonnage: number | null;
  ore_tonnage_unit: string;
  grade_pct: number | null;
  contained_metal_value: number | null;
  contained_metal_unit: string;
  missing_reason: string | null;
  classification: string;
  ownership_basis: string;
  production_stage: string;
  effective_date: string;
  source_id: string;
};

export type SupplyEvent = {
  id: string;
  project_id: string;
  metal_id: string;
  event_type: string;
  severity: string;
  status: string;
  event_start_date: string;
  operations_suspended_date: string | null;
  operations_resumed_date: string | null;
  reported_date: string;
  headline_zh: string;
  summary_zh: string;
  source_id: string;
  source_ids: string[];
};

export type InventoryFact = {
  id: string;
  exchange: "LME" | "SHFE" | "COMEX";
  inventory_type: string;
  value: number | null;
  original_unit: string;
  normalized_value: number | null;
  normalized_unit: string;
  data_date: string | null;
  published_at: string | null;
  source_id: string;
  source_tier: "A" | "B";
  frequency: string;
  change_pct: number | null;
  change_period: string | null;
  notes: string;
  license_status: string;
  missing_reason: string | null;
};

export const publicData = {
  projects: projectsJson.items as PublicProject[],
  production: productionJson.items as ProductionFact[],
  guidance: guidanceJson.items as GuidanceFact[],
  reserves: reservesJson.items as ReserveFact[],
  events: eventsJson.items as SupplyEvent[],
  inventories: inventoriesJson.items as InventoryFact[],
  sources: sourcesJson.items as PublicSource[],
  coverage: coverageJson,
  updatedAt: projectsJson.updated_at,
};

export function sourceById(id: string | null): PublicSource | undefined {
  if (!id) return undefined;
  return publicData.sources.find((source) => source.id === id);
}
export function projectBySlug(slug: string): PublicProject | undefined {
  return publicData.projects.find((project) => project.slug === slug);
}

export function formatMissing(reason: string | null | undefined): string {
  if (reason === "not_disclosed") return "待补 / 未披露";
  return reason ? `待补 / ${reason}` : "待补";
}

export function projectFacts(projectId: string) {
  const production = publicData.production.filter((item) => item.project_id === projectId);
  const guidance = publicData.guidance.filter((item) => item.project_id === projectId);
  const reserves = publicData.reserves.filter((item) => item.project_id === projectId);
  const events = publicData.events.filter((item) => item.project_id === projectId);
  return { production, guidance, reserves, events };
}

export function projectCompleteness(projectId: string) {
  const facts = projectFacts(projectId);
  return {
    production: facts.production.some((item) => item.value !== null),
    guidance: facts.guidance.some((item) => item.low !== null || item.high !== null),
    reserves: facts.reserves.some((item) => item.ore_tonnage !== null),
    event: facts.events.length > 0,
  };
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number | null>>): void {
  if (!rows.length) return;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const quote = (value: string | number | null | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = `\uFEFF${headers.map(quote).join(",")}\n${rows.map((row) => headers.map((key) => quote(row[key])).join(",")).join("\n")}`;
  const anchor = document.createElement("a");
  const objectUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
