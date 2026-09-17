export type Completeness = { code: string; label: string };

export type AdminProject = {
  id: string;
  name: string;
  slug: string;
  country: { iso3: string; name_zh: string; name_en: string };
  operator: { id: string; canonical_name: string } | null;
  status: string;
  raw_material_route: string | null;
  latitude: string | null;
  longitude: string | null;
  created_at: string;
  updated_at: string;
  has_observations: boolean;
  observation_count: number;
  pending_observation_count: number;
  published_observation_count: number;
  completeness: Completeness[];
};

export type AdminProjectList = {
  items: AdminProject[];
  total: number;
  page: number;
  page_size: number;
  filters: {
    countries: { iso3: string; name_zh: string }[];
    statuses: string[];
    completeness: Completeness[];
  };
};

export type AdminObservation = Record<string, unknown> & {
  id: string;
  record_key: string;
  normalized_value: string | null;
  normalized_unit: string;
  missing_reason: string | null;
  review_status: string;
  published: boolean;
  source_code: string;
  source: {
    id: string;
    code: string;
    organization_name: string;
    material_title: string;
    material_url: string;
    published_at: string;
    verified_at: string;
    source_type: string;
    is_demo: boolean;
  };
};

export type AdminProjectDetail = {
  project: AdminProject;
  ownership: {
    id: string;
    company: { id: string; canonical_name: string };
    ownership_pct: string;
    valid_from: string;
    valid_to: string | null;
  }[];
  sources: AdminObservation["source"][];
  observations: {
    production: AdminObservation[];
    guidance: AdminObservation[];
    reserves: AdminObservation[];
  };
  missing: {
    project_fields: string[];
    observations: { kind: string; record_key: string; field: string; reason: string | null }[];
  };
};

export type AdminProjectFilters = {
  q: string;
  country: string;
  status: string;
  completeness: string;
  sort: string;
  page: number;
  pageSize: number;
};

export function adminProjectsQuery(filters: AdminProjectFilters): string {
  const query = new URLSearchParams();
  if (filters.q.trim()) query.set("q", filters.q.trim());
  if (filters.country) query.set("country", filters.country);
  if (filters.status) query.set("status", filters.status);
  if (filters.completeness) query.set("completeness", filters.completeness);
  query.set("sort", filters.sort);
  query.set("page", String(filters.page));
  query.set("page_size", String(filters.pageSize));
  return query.toString();
}
