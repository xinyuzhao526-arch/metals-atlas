import assert from "node:assert/strict";
import test from "node:test";
import { parseComexRows, parseLmeSnapshot, parseShfeDaily, parseShfeWeekly } from "../scripts/update-inventories.mjs";

test("COMEX parser keeps registered, eligible and total definitions separate", () => {
  const html = '<tr data-registered="477102.000" data-eligible="293781.000" data-total="770883.000" data-change="914" data-reg-change="0"><td>2026-09-24</td></tr>';
  assert.deepEqual(parseComexRows(html)[0], { date: "2026-09-24", registered: 477102, eligible: 293781, total: 770883, totalChange: 914, registeredChange: 0 });
});

test("SHFE parsers select the copper grand total and preserve report definitions", () => {
  const daily = '<td>2026-09-24</td><tr class="special_row_type"><td><div class="cell">铜</div></td></tr><tr><td>完税商品总计</td><td>16620</td><td>-2468</td></tr><tr><td>总计</td><td>16620</td><td>-2468</td></tr><tr class="special_row_type"><td><div class="cell">铝</div></td></tr>';
  const weekly = '<td>2026-09-18</td><tr class="special_row_type"><td><div class="cell">铜</div></td></tr><tr><td>总计</td><td>54780</td><td>20854</td><td>56073</td><td>26655</td><td>1293</td><td>5801</td></tr><tr class="special_row_type"><td><div class="cell">铝</div></td></tr>';
  assert.deepEqual(parseShfeDaily(daily), { date: "2026-09-24", value: 16620, change: -2468 });
  assert.deepEqual(parseShfeWeekly(weekly), { date: "2026-09-18", previousInventory: 54780, previousWarrants: 20854, inventory: 56073, warrants: 26655 });
});

test("LME parser reads only the dated public latest snapshot", () => {
  const html = '<meta name="description" content="As of September 25, 2026, London Metal Exchange Copper total warehouse stocks stands at 251.5K mt. It has increased by 5.9% over the past 30 days." />';
  assert.deepEqual(parseLmeSnapshot(html), { date: "2026-09-25", value: 251500, change30dPct: 5.9 });
});
