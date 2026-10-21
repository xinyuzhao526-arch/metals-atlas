import type { PublicSource } from "@/lib/public-data";
export type SupplyAsset = {
  id: string; name: string; country: string; operator: string; stage: string;
  product: string; value: number | null; unit: string; period: string; basis: string;
  effective_date: string; source_code: string; record_key: string; sourceId: string;
  missing_reason: { production: string | null; guidance: string; reserve: string };
  guidance: null; reserve: null;
};
export type SupplyConfig = { slug: string; symbol: string; name: string; english: string; scope: string; sources: PublicSource[]; projects: SupplyAsset[] };
const verified = "2026-10-21";
const missing = { production: null, guidance: "not_recorded_in_this_release", reserve: "not_recorded_in_this_release" };
export const tinConfig: SupplyConfig = {
  slug: "tin", symbol: "Sn", name: "锡", english: "Tin",
  scope: "精矿含锡、尾矿回收含锡与精炼锡分阶段呈现，不重复相加。首批覆盖 Bisie 矿区合计，未将 Mpama North 与 Mpama South 拆分为虚构的独立产量。",
  sources: [{ id: "sn-alphamin-2025", tier: "A", source_type: "company_results", organization: "Alphamin Resources", title: "FY2025 Tin Production Update", publication_date: "2026-01-19", verification_date: verified, url: "https://www.alphaminresources.com/2026/01/19/alphamin-announces-record-fy2025-tin-production-fy2026-production-guidance-exploration-update-senior-management-changes/", locator: "Operational and Financial Performance; footnote 1", short_excerpt: null }],
  projects: [{ id: "bisie", name: "Bisie · Mpama North / South", country: "刚果（金）", operator: "Alphamin Resources", stage: "采矿 + 选矿", product: "精矿含锡", value: 18576, unit: "t Sn", period: "FY2025 · 2025-01-01—2025-12-31", basis: "矿区合计 100%；非 Alphamin 应占（间接持股 84.14%）", effective_date: "2025-12-31", source_code: "alphamin", record_key: "bisie-contained-tin-fy2025", sourceId: "sn-alphamin-2025", missing_reason: missing, guidance: null, reserve: null }],
};
export const ironConfig: SupplyConfig = {
  slug: "iron", symbol: "Fe", name: "铁", english: "Iron",
  scope: "铁矿石产品吨不等于含铁金属吨。粉矿、块矿、精矿、球团与粗钢按阶段阅读；产量与发运量分开，项目 100% 与公司应占数据不汇总。首批为 2024 历史披露，不代表当前最新产量。",
  sources: [{ id: "fe-rio-2024", tier: "A", source_type: "company_results", organization: "Rio Tinto", title: "Fourth Quarter Operations Review 2024", publication_date: "2025-01-16", verification_date: verified, url: "https://www.riotinto.com/en/news/releases/2025/rio-tinto-releases-fourth-quarter-production-results", locator: "Production table: 2024 column; footnotes 1 and 3", short_excerpt: null }],
  projects: [
    { id: "pilbara", name: "Pilbara · 运营矿区合计", country: "澳大利亚", operator: "Rio Tinto", stage: "采矿 + 加工", product: "铁矿石产品", value: 328, unit: "Mt 产品", period: "2024 日历年 · 全年", basis: "矿区组合 100%；不等于单矿产量或发运量", effective_date: "2024-12-31", source_code: "rio-tinto", record_key: "pilbara-iron-ore-production-cy2024", sourceId: "fe-rio-2024", missing_reason: missing, guidance: null, reserve: null },
    { id: "ioc", name: "Iron Ore Company of Canada", country: "加拿大", operator: "Iron Ore Company of Canada", stage: "选矿 + 球团", product: "球团与精矿（原始合并披露）", value: 9.4, unit: "Mt 产品", period: "2024 日历年 · 全年", basis: "Rio Tinto 应占；非项目 100%", effective_date: "2024-12-31", source_code: "rio-tinto", record_key: "ioc-pellets-concentrate-cy2024-rio-share", sourceId: "fe-rio-2024", missing_reason: missing, guidance: null, reserve: null },
  ],
};
