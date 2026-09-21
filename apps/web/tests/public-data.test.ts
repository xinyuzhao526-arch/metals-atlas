import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function data(name: string) {
  return JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
}

test("public facts retain source links and null missing values", () => {
  const sources = new Set(data("sources").items.map((item: { id: string }) => item.id));
  for (const name of ["production", "guidance", "reserves"]) {
    for (const item of data(name).items) assert.ok(sources.has(item.source_id), `${name}:${item.id} has a valid source_id`);
  }
  const reserve = data("reserves").items[0];
  assert.equal(reserve.contained_metal_value, null);
  assert.equal(reserve.missing_reason, "not_disclosed");
});

test("Las Bambas published facts match the verified observations", () => {
  const production = data("production").items;
  assert.equal(production.find((item: { id: string }) => item.id.endsWith("2026-q2")).value, 109.192);
  assert.equal(production.find((item: { id: string }) => item.id.endsWith("2025-fy")).value, 410.834);
  const guidance = data("guidance").items[0];
  assert.deepEqual([guidance.low, guidance.high, guidance.guidance_kind], [380, 400, "maintained"]);
});

test("public files do not expose local or administrator secrets", () => {
  const serialized = ["projects", "production", "guidance", "reserves", "events", "inventories", "sources"].map((name) => JSON.stringify(data(name))).join("\n");
  for (const forbidden of ["password", "cookie", "admin@example.com", "local_storage_path", "D:\\\\Codex"])
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, `does not contain ${forbidden}`);
});

test("copper atlas contains exactly 44 non-demo projects with valid approximate coordinates", () => {
  const projects = data("projects").items;
  assert.equal(projects.length, 44);
  assert.equal(projects.some((item: { slug: string }) => ["escondida", "morenci"].includes(item.slug)), false);
  for (const project of projects) {
    assert.ok(project.location.latitude >= -90 && project.location.latitude <= 90, project.slug);
    assert.ok(project.location.longitude >= -180 && project.location.longitude <= 180, project.slug);
    assert.equal(project.location.precision, "approximate");
    assert.equal(project.location.source_id, "src-open-geodata-method");
  }
});

test("inventory records keep definitions, units, dates and licensing state separate", () => {
  const inventories = data("inventories").items;
  const sources = new Set(data("sources").items.map((item: { id: string }) => item.id));
  const required = ["exchange", "inventory_type", "value", "original_unit", "normalized_value", "normalized_unit", "data_date", "published_at", "source_id", "source_tier", "frequency", "notes", "license_status"];
  for (const item of inventories) {
    for (const key of required) assert.ok(Object.hasOwn(item, key), `${item.id} has ${key}`);
    assert.ok(sources.has(item.source_id), `${item.id} source exists`);
    if (item.value === null) assert.ok(item.missing_reason, `${item.id} explains missing value`);
    else assert.ok(item.data_date, `${item.id} numeric value has data_date`);
  }
  assert.equal(inventories.find((item: { id: string }) => item.id.startsWith("inventory-shfe-weekly")).value, 69280);
  assert.equal(inventories.find((item: { id: string }) => item.id.startsWith("inventory-lme-total")).value, 242900);
  assert.equal(inventories.find((item: { id: string }) => item.id === "inventory-comex-total-pending").value, null);
});

test("coverage metrics match public facts without incompatible aggregation", () => {
  const coverage = data("coverage");
  assert.equal(coverage.project_count, 44);
  assert.equal(coverage.mapped_count, 44);
  assert.deepEqual(coverage.location_precision, { exact: 0, approximate: 44, pending: 0 });
  assert.equal(coverage.production_project_count, 2);
  assert.equal(coverage.current_guidance_project_count, 2);
  assert.equal(coverage.production_aggregate, null);
  assert.ok(coverage.production_aggregate_missing_reason);
});

test("external source action opens a new tab with safe rel attributes", () => {
  const drawer = readFileSync(new URL("../components/PublicSourceDrawer.tsx", import.meta.url), "utf8");
  assert.match(drawer, /target="_blank"/);
  assert.match(drawer, /rel="noopener noreferrer"/);
});
