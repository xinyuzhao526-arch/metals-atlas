import test from "node:test";
import assert from "node:assert/strict";
import { tinConfig, ironConfig, assetFacts, exportFacts, filterAssets } from "../lib/tin-iron-data.ts";

test("tin and iron observations have stable identity, concrete provenance and valid periods", () => {
  for (const c of [tinConfig, ironConfig]) {
    const keys = new Set<string>();
    for (const f of c.facts) {
      const key = f.source_code + ":" + f.record_key;
      assert.ok(!keys.has(key), key); keys.add(key);
      const p = c.projects.find(p => p.id === f.project_id);
      const s = c.sources.find(s => s.id === f.source_id);
      assert.ok(p && s); assert.equal(f.production_stage, p.stage);
      assert.equal(f.source_publication_date, s.publication_date);
      assert.equal(f.verification_date, s.verification_date);
      assert.ok(s.organization && s.title && s.locator && s.source_type);
      assert.match(s.url, /^https:\/\//);
      assert.ok(f.period.start <= f.period.end);
      assert.ok(f.effective_date <= f.verification_date);
      assert.ok(f.source_publication_date <= f.verification_date);
      assert.ok(f.ownership_basis && f.period.calendar_basis);
      assert.equal(f.value === null, f.missing_reason !== null);
      if (f.upper !== null) assert.ok(f.value !== null && f.upper >= f.value);
    }
    for (const e of c.events) {
      assert.ok(c.projects.some(p => p.id === e.projectId));
      assert.ok(c.sources.some(s => s.id === e.sourceId));
    }
  }
});

test("shipments never fill missing Iron Bridge production or become production guidance", () => {
  const production = assetFacts(ironConfig, "iron-bridge", "production")[0];
  assert.equal(production.value, null);
  assert.ok(production.missing_reason?.detail.includes("不以发运量代替产量"));
  const rows = exportFacts(ironConfig, ["iron-bridge"]);
  assert.equal(rows.find(r => r.metric === "production")?.value, null);
  assert.equal(rows.find(r => r.metric === "shipments")?.value, 7.1);
  assert.ok(rows.find(r => r.metric === "guidance")?.note.includes("非生产"));
  assert.ok(!filterAssets(ironConfig,{search:"",country:"all",coverage:"production",sort:"name"}).some(p=>p.id==="iron-bridge"));
});

test("fiscal YTD, calendar annual, attributable and downstream products remain distinct", () => {
  const uis = assetFacts(tinConfig, "uis", "production");
  assert.equal(uis.find(f => f.period.type === "ytd")?.period.start, "2025-03-01");
  assert.equal(uis.find(f => f.period.type === "ytd")?.period.calendar_basis, "fiscal");
  assert.equal(uis.filter(f => f.period.type === "annual").length, 0);
  assert.ok(assetFacts(ironConfig, "ioc", "production").every(f => f.ownership_basis === "Rio Tinto 应占"));
  assert.notEqual(tinConfig.projects.find(p=>p.id==="pisco")?.stage, tinConfig.projects.find(p=>p.id==="san-rafael")?.stage);
  assert.ok(assetFacts(tinConfig,"renison","reserve")[0].note.includes("Proved + Probable"));
  assert.ok(assetFacts(ironConfig,"minas-rio","reserve")[0].unit.includes("ROM"));
});

test("inventory snapshots preserve product definitions, missing series and source dates", () => {
  for (const c of [tinConfig, ironConfig]) for (const channel of c.stocks) {
    assert.ok(channel.definition);
    if (!channel.points.length) assert.ok(channel.missing_reason);
    const dates = new Set<string>();
    for (const point of channel.points) {
      assert.ok(!dates.has(point.data_date)); dates.add(point.data_date);
      const s=c.sources.find(s=>s.id===point.source_id);
      assert.ok(s && point.production_stage);
      assert.ok(point.data_date <= s.publication_date!);
      assert.equal(point.value === null, point.missing_reason !== null);
      assert.ok(point.source_code && point.record_key);
    }
  }
  assert.equal(tinConfig.stocks[0].points.at(-1)?.value, 5902);
  assert.equal(tinConfig.stocks[1].points.at(-1)?.value, 2860);
  assert.ok(ironConfig.stocks[0].definition.includes("不是中国港口"));
});

test("country, keyword and coverage filters combine; exports retain source metadata", () => {
  const rows=filterAssets(tinConfig,{search:"Minsur",country:"PER",coverage:"production",sort:"name"});
  assert.deepEqual(new Set(rows.map(p=>p.id)),new Set(["san-rafael","b2","pisco"]));
  const exported=exportFacts(tinConfig,rows.map(p=>p.id));
  assert.ok(exported.every(r=>r.country==="秘鲁" && r.source_organization==="Minsur" && r.source_publication_date==="2025-03-03"));
  assert.ok(exported.every(r=>r.period_type!==undefined && r.ownership_basis && r.production_stage));
  assert.equal(filterAssets(tinConfig,{search:"no-such-asset",country:"all",coverage:"all",sort:"name"}).length,0);
});
