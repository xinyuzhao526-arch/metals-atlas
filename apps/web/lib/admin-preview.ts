export type JsonRecord = Record<string, unknown>;

export type PreviewDiff = Record<string, { before: unknown; after: unknown }>;

export type PreviewRow = {
  id: string;
  sheet: string;
  row_number: number;
  classification: string;
  errors: string[];
  warnings: string[];
  confirmation_result: "applied" | "skipped" | "failed" | "not_confirmed";
  applied_record_id: string | null;
  entity: {
    type: string;
    id: string | null;
    label: string | null;
    project: { id: string; slug: string; name: string; admin_path: string } | null;
  } | null;
  raw: JsonRecord;
  normalized: JsonRecord | null;
  before: JsonRecord | null;
  diff: PreviewDiff;
};

export type Preview = {
  id: string;
  filename: string;
  status: string;
  previewed_at?: string;
  confirmed_at?: string | null;
  summary: Record<string, number>;
  sheet_counts: Record<string, number>;
  action_summary: ImportActionSummary;
  rows: PreviewRow[];
};

export type ImportActionSummary = {
  new: number;
  update: number;
  no_change: number;
  pending_review_observations: number;
  by_sheet: Record<string, { new: number; update: number; no_change: number }>;
};

export type ImportHistoryItem = {
  id: string;
  filename: string;
  status: string;
  summary: Record<string, number>;
  previewed_at: string;
  confirmed_at: string | null;
  created_at: string;
  row_count: number;
  applied_count: number;
  error_count: number;
  action_summary: ImportActionSummary;
};

export type ConfirmationResponse = {
  id: string;
  status: string;
  confirmed_at: string;
  result: ImportActionSummary;
};

export const classificationOrder = ["new", "update", "no_change", "conflict", "invalid"];

export const classificationNames: Record<string, string> = {
  new: "新增",
  update: "更新",
  no_change: "无变化",
  conflict: "冲突",
  invalid: "校验失败",
};

export function confirmationSuccessMessage(result: ImportActionSummary): string {
  const projects = result.by_sheet.projects?.new ?? 0;
  if (projects === result.new && result.update === 0) {
    if (result.pending_review_observations === 0) {
      return `导入成功：新增 ${projects} 个项目，创建 0 条待审核观察记录。由于没有已发布观察数据，这些项目暂不出现在公开页面。`;
    }
    return `导入成功：新增 ${projects} 个项目，创建 ${result.pending_review_observations} 条待审核观察记录，本次不会直接公开。`;
  }
  return `导入成功：新增 ${result.new} 条、更新 ${result.update} 条，创建 ${result.pending_review_observations} 条待审核观察记录，本次不会直接公开。`;
}

export function confirmationFailureMessage(detail: string): string {
  const clean = detail.replace(/[。\s]+$/u, "") || "确认导入失败";
  return `确认失败：${clean}。本次未写入数据库。`;
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function period(payload: JsonRecord): string {
  const start = text(payload.period_start);
  const end = text(payload.period_end);
  return start === end ? start : `${start} → ${end}`;
}

function guidancePeriod(payload: JsonRecord): string {
  return text(payload.fiscal_year_label)
    .replace("—", String(payload.period_start ?? "").slice(0, 4) || "—");
}

export type BusinessSummary = {
  title: string;
  fields: { label: string; value: string }[];
};

export function businessSummary(row: PreviewRow): BusinessSummary {
  const payload = row.normalized ?? row.raw;
  switch (row.sheet) {
    case "projects":
      return {
        title: text(payload.name ?? payload.slug),
        fields: [
          { label: "slug", value: text(payload.slug) },
          { label: "ISO3", value: text(payload.country_iso3) },
          { label: "运营方", value: text(payload.operator_company) },
          { label: "状态", value: text(payload.status) },
        ],
      };
    case "companies":
      return {
        title: text(payload.canonical_name),
        fields: [
          { label: "国家", value: text(payload.country_iso3) },
          { label: "财年起始月", value: text(payload.fiscal_year_start_month) },
        ],
      };
    case "ownership":
      return {
        title: `${text(payload.project_slug)} / ${text(payload.company_name)}`,
        fields: [
          { label: "持股", value: `${text(payload.ownership_pct)}%` },
          { label: "有效期", value: `${text(payload.valid_from)} → ${text(payload.valid_to)}` },
        ],
      };
    case "sources":
      return {
        title: text(payload.code),
        fields: [
          { label: "机构", value: text(payload.organization_name) },
          { label: "发布日期", value: text(payload.published_at) },
          { label: "URL", value: text(payload.material_url) },
        ],
      };
    case "production":
      return {
        title: `${text(payload.project_slug)} · ${text(payload.record_key)}`,
        fields: [
          { label: "金属", value: text(payload.metal_code) },
          { label: "期间", value: period(payload) },
          { label: "数值", value: `${text(payload.normalized_value)} ${text(payload.normalized_unit)}` },
          { label: "生产环节", value: text(payload.production_stage) },
          { label: "所有权口径", value: text(payload.ownership_basis) },
          { label: "来源", value: text(payload.source_code) },
        ],
      };
    case "guidance":
      return {
        title: `${text(payload.project_slug)} · ${text(payload.record_key)}`,
        fields: [
          { label: "年度", value: guidancePeriod(payload) },
          { label: "区间", value: `${text(payload.guidance_low)} – ${text(payload.guidance_high)} ${text(payload.normalized_unit)}` },
          { label: "口径", value: text(payload.ownership_basis) },
          { label: "来源", value: text(payload.source_code) },
        ],
      };
    case "reserves":
      return {
        title: `${text(payload.project_slug)} · ${text(payload.record_key)}`,
        fields: [
          { label: "分类", value: `${text(payload.reserve_kind)} / ${text(payload.classification)}` },
          { label: "数值", value: `${text(payload.contained_metal_value)} ${text(payload.normalized_unit)}` },
          { label: "口径", value: text(payload.ownership_basis) },
          { label: "来源", value: text(payload.source_code) },
        ],
      };
    default:
      return {
        title: text(payload.record_key ?? payload.record_id ?? `第 ${row.row_number} 行`),
        fields: [],
      };
  }
}

export function filterPreviewRows(
  rows: PreviewRow[],
  sheet: string,
  classification: string,
  keyword: string,
): PreviewRow[] {
  const needle = keyword.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (sheet && row.sheet !== sheet) return false;
    if (classification && row.classification !== classification) return false;
    if (!needle) return true;
    const summary = businessSummary(row);
    const searchable = JSON.stringify({
      sheet: row.sheet,
      row: row.row_number,
      title: summary.title,
      fields: summary.fields,
      raw: row.raw,
      normalized: row.normalized,
      errors: row.errors,
      warnings: row.warnings,
    }).toLocaleLowerCase();
    return searchable.includes(needle);
  });
}
