export type Source = {
  code: string;
  organization_name: string;
  material_title: string;
  material_url: string;
  published_at: string;
  verified_at: string;
  source_type: string;
  is_demo: boolean;
};

export type Observation = {
  id: string;
  kind: "production" | "guidance" | "reserves";
  value: string | null;
  unit: string;
  missing_reason: string | null;
  effective_date: string;
  period: { start: string; end: string; type: string };
  calendar_basis: string;
  fiscal_year_label: string | null;
  ownership_basis: string;
  production_stage: string;
  is_current?: boolean;
  supersedes_id?: string | null;
  confirmed_at?: string | null;
  source: Source;
  guidance_low?: string | null;
  guidance_high?: string | null;
  guidance_kind?: string;
  reserve_kind?: string;
  classification?: string;
};

export type ProjectSummary = {
  slug: string;
  name: string;
  country: { iso3: string; name_zh: string; name_en: string };
  status: string;
  production_stages: string[];
};

export type ProjectDetail = ProjectSummary & {
  operator: string | null;
  raw_material_route: string | null;
  ownership: { company: string; ownership_pct: string; valid_from: string; valid_to: string | null }[];
  production: Observation[];
  guidance: Observation[];
  reserves: Observation[];
};
