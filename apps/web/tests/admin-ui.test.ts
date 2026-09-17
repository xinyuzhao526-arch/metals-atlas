import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyAdminFailure,
  CSRF_EXPIRED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from "../lib/admin-auth.ts";
import {
  businessSummary,
  confirmationFailureMessage,
  confirmationSuccessMessage,
  filterPreviewRows,
} from "../lib/admin-preview.ts";
import type { PreviewRow } from "../lib/admin-preview.ts";
import { adminProjectsQuery } from "../lib/admin-projects.ts";
import { requiresAdminLogin } from "../lib/admin-route.ts";


function row(overrides: Partial<PreviewRow> = {}): PreviewRow {
  return {
    id: "row-1",
    sheet: "projects",
    row_number: 2,
    classification: "new",
    errors: [],
    warnings: [],
    raw: {},
    normalized: {
      name: "Cerro Verde",
      slug: "cerro-verde",
      country_iso3: "PER",
      operator_company: "Freeport-McMoRan",
      status: "operating",
    },
    before: null,
    diff: {},
    confirmation_result: "not_confirmed",
    applied_record_id: null,
    entity: null,
    ...overrides,
  };
}


test("401 uses the localized expired-session redirect without retry", () => {
  const result = classifyAdminFailure({ status: 401, detail: "Invalid session" });
  assert.deepEqual(result, {
    kind: "session",
    message: SESSION_EXPIRED_MESSAGE,
    redirect: true,
    retry: false,
  });
});


test("CSRF failure uses the safe localized message and never retries", () => {
  const result = classifyAdminFailure({
    status: 403,
    detail: "CSRF validation failed",
  });
  assert.deepEqual(result, {
    kind: "csrf",
    message: CSRF_EXPIRED_MESSAGE,
    redirect: false,
    retry: false,
  });
});


test("project and production summaries expose business review fields", () => {
  const project = businessSummary(row());
  assert.equal(project.title, "Cerro Verde");
  assert.deepEqual(
    project.fields.map((field) => [field.label, field.value]),
    [
      ["slug", "cerro-verde"],
      ["ISO3", "PER"],
      ["运营方", "Freeport-McMoRan"],
      ["状态", "operating"],
    ],
  );

  const production = businessSummary(row({
    sheet: "production",
    normalized: {
      project_slug: "cerro-verde",
      record_key: "cv-2025-production",
      metal_code: "Cu",
      period_start: "2025-01-01",
      period_end: "2025-12-31",
      normalized_value: "450",
      normalized_unit: "kt",
      production_stage: "mine_contained_metal",
      ownership_basis: "project_100",
      source_code: "SRC-2025",
    },
  }));
  assert.match(production.title, /cerro-verde/);
  assert.ok(production.fields.some((field) => field.value === "450 kt"));
  assert.ok(production.fields.some((field) => field.value === "SRC-2025"));
});


test("preview filters combine sheet, classification, and keyword", () => {
  const rows = [
    row(),
    row({
      id: "row-2",
      sheet: "companies",
      row_number: 3,
      classification: "conflict",
      normalized: {
        canonical_name: "BHP",
        country_iso3: "AUS",
        fiscal_year_start_month: 7,
      },
    }),
  ];

  assert.equal(filterPreviewRows(rows, "projects", "", "").length, 1);
  assert.equal(filterPreviewRows(rows, "", "conflict", "").length, 1);
  assert.equal(filterPreviewRows(rows, "", "", "PER").length, 1);
  assert.equal(filterPreviewRows(rows, "", "", "BHP").length, 1);
  assert.equal(filterPreviewRows(rows, "projects", "conflict", "").length, 0);
});


test("successful project-only confirmation reports projects and zero review items", () => {
  assert.equal(
    confirmationSuccessMessage({
      new: 44,
      update: 0,
      no_change: 0,
      pending_review_observations: 0,
      by_sheet: { projects: { new: 44, update: 0, no_change: 0 } },
    }),
    "导入成功：新增 44 个项目，创建 0 条待审核观察记录。由于没有已发布观察数据，这些项目暂不出现在公开页面。",
  );
});


test("failed confirmation explicitly says the transaction wrote nothing", () => {
  assert.equal(
    confirmationFailureMessage("数据库事务失败"),
    "确认失败：数据库事务失败。本次未写入数据库。",
  );
});


test("nested admin project and import pages require a session", () => {
  assert.equal(requiresAdminLogin("/admin/projects", false), true);
  assert.equal(requiresAdminLogin("/admin/projects/spence", false), true);
  assert.equal(requiresAdminLogin("/admin/imports/job-1", false), true);
  assert.equal(requiresAdminLogin("/admin/projects", true), false);
  assert.equal(requiresAdminLogin("/admin/login", false), false);
});


test("admin project query includes all directory filters", () => {
  const query = adminProjectsQuery({
    q: "Spence",
    country: "CHL",
    status: "operating",
    completeness: "only_project_master",
    sort: "name_asc",
    page: 2,
    pageSize: 25,
  });
  const params = new URLSearchParams(query);
  assert.equal(params.get("q"), "Spence");
  assert.equal(params.get("country"), "CHL");
  assert.equal(params.get("status"), "operating");
  assert.equal(params.get("completeness"), "only_project_master");
  assert.equal(params.get("sort"), "name_asc");
  assert.equal(params.get("page"), "2");
});
