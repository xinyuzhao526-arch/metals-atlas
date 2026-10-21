import test from "node:test";
import assert from "node:assert/strict";
import { tinConfig, ironConfig, assetFacts, exportFacts, exportStocks, filterAssets, annualProductionFacts, latestFact } from "../lib/tin-iron-data.ts";

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
  assert.equal(latestFact(ironConfig,"iron-bridge","shipments","annual")?.value, 9);
  assert.ok(rows.some(r=>r.metric==="shipments" && r.value===7.1));
  assert.ok(rows.find(r => r.metric === "guidance")?.note.includes("非生产"));
  assert.ok(!filterAssets(ironConfig,{search:"",country:"all",coverage:"production",sort:"name"}).some(p=>p.id==="iron-bridge"));
});

test("fiscal YTD, calendar annual, attributable and downstream products remain distinct", () => {
  const uis = assetFacts(tinConfig, "uis", "production");
  assert.equal(uis.find(f => f.period.type === "ytd")?.period.start, "2026-03-01");
  assert.equal(uis.find(f => f.period.type === "ytd")?.period.calendar_basis, "fiscal");
  assert.equal(uis.find(f => f.period.type === "annual")?.value, 1036);
  assert.equal(uis.find(f => f.period.type === "annual")?.period.end, "2026-02-28");
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
      if (s.publication_date) assert.ok(point.data_date <= s.publication_date);
      else assert.ok(point.source_publication_date_missing_reason);
      assert.equal(point.value === null, point.missing_reason !== null);
      assert.ok(point.source_code && point.record_key);
    }
  }
  assert.equal(tinConfig.stocks[0].points.at(-1)?.value, 5902);
  assert.equal(tinConfig.stocks[1].points.at(-1)?.value, 2860);
  assert.ok(ironConfig.stocks.find(s=>s.id==="kumba-finished")?.definition.includes("不是中国港口"));
});

test("country, keyword and coverage filters combine; exports retain source metadata", () => {
  const rows=filterAssets(tinConfig,{search:"Minsur",country:"PER",coverage:"production",sort:"name"});
  assert.deepEqual(new Set(rows.map(p=>p.id)),new Set(["san-rafael","b2","pisco"]));
  const exported=exportFacts(tinConfig,rows.map(p=>p.id));
  assert.ok(exported.every(r=>r.country==="秘鲁" && r.source_organization==="Minsur"));
  assert.ok(exported.every(r=>r.period_type!==undefined && r.ownership_basis && r.production_stage));
  assert.equal(filterAssets(tinConfig,{search:"no-such-asset",country:"all",coverage:"all",sort:"name"}).length,0);
});


test("latest YTD and completed annual remain visible with separate fiscal periods", () => {
  const minsur=annualProductionFacts(tinConfig,"san-rafael");
  assert.deepEqual(minsur.map(f=>[f.period.type,f.value]), [["ytd",13455],["annual",26037]]);
  const uis=annualProductionFacts(tinConfig,"uis");
  assert.deepEqual(uis.map(f=>[f.period.label,f.value]), [["FY2027 H1 · 财年累计",576],["FY2026 全年 · 3月至次年2月",1036]]);
  assert.equal(latestFact(ironConfig,"waio","production","quarter")?.value,71.9);
  assert.equal(latestFact(ironConfig,"sishen","production","quarter")?.value,4.947);
  assert.equal(latestFact(ironConfig,"sishen","production","ytd")?.value,17.683);
  const revised={...ironConfig,facts:[...ironConfig.facts.filter(f=>f.project_id==="waio"&&f.metric==="guidance")].reverse()};
  assert.equal(latestFact(revised,"waio","guidance")?.source_publication_date,"2026-10-20");
});

test("targets preserve sales, shipment and production meaning in exports", () => {
  assert.equal(latestFact(ironConfig,"pilbara","guidance")?.guidance_kind,"sales");
  assert.equal(latestFact(ironConfig,"ioc","guidance")?.ownership_basis,"运营合计 100%");
  assert.ok(assetFacts(ironConfig,"ioc","production").every(f=>f.ownership_basis==="Rio Tinto 应占"));
  assert.equal(latestFact(ironConfig,"iron-bridge","guidance")?.guidance_kind,"shipments");
  assert.equal(latestFact(ironConfig,"waio","guidance")?.guidance_kind,"production");
  assert.equal(exportFacts(ironConfig,["pilbara"]).find(r=>r.guidance_kind==="sales")?.value,323);
});

test("exchange snapshots retain raw units and secondary source grades", () => {
  const lme=exportStocks(tinConfig,"lme-stock");
  assert.equal(lme.length,14); assert.equal(lme.at(-1)?.value,4035);
  assert.ok(lme.every(p=>p.source_publication_date===null && p.source_publication_date_missing_reason?.includes("publication_date_not_disclosed")));
  assert.ok(lme.every(p=>p.source_tier==="B" && p.unit==="t" && p.source_organization.includes("Westmetall")));
  const shfe=exportStocks(tinConfig,"shfe-daily-warrant");
  assert.deepEqual(shfe.map(p=>p.value),[2860,2792,2584]);
  assert.ok(shfe.every(p=>p.source_tier==="A"));
  const dce=exportStocks(ironConfig,"dce-warrant");
  assert.equal(dce.at(-1)?.value,2300);
  assert.ok(dce.every(p=>p.unit==="手" && p.source_tier==="B"));
  assert.ok(ironConfig.stocks.find(s=>s.id==="china-port")?.missing_reason);
});
