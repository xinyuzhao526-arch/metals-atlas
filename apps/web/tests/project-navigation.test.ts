import test from "node:test";
import assert from "node:assert/strict";
import { focusProjectRecord } from "../lib/project-navigation.ts";

function record(id: string, visible: boolean, table = false) {
  return {
    dataset: { mapProject: id }, highlighted: false,
    focuses: [] as unknown[], scrolls: [] as unknown[], tableScrolls: [] as unknown[],
    getClientRects: () => visible ? [{}] : [],
    toggleAttribute(_name: string, value: boolean) { this.highlighted = value; },
    focus(options: unknown) { this.focuses.push(options); },
    scrollIntoView(options: unknown) { this.scrolls.push(options); },
    closest() { return table ? { scrollTo: (options: unknown) => this.tableScrolls.push(options) } : null; },
  };
}
const root = (...records: ReturnType<typeof record>[]) => ({ querySelectorAll: () => records }) as unknown as HTMLElement;

test("map selection locates the matching desktop row, clears the previous highlight and restores the asset name", () => {
  const other = record("ni-nova", true), row = record("ni-onca-puma", true, true), card = record("ni-onca-puma", false);
  other.highlighted = true;
  assert.equal(focusProjectRecord(root(other,row,card),"ni-onca-puma"),true);
  assert.equal(other.highlighted,false);
  assert.ok(row.highlighted && card.highlighted);
  assert.equal(other.focuses.length,0);
  assert.deepEqual(row.focuses,[{preventScroll:true}]);
  assert.deepEqual(row.scrolls,[{behavior:"smooth",block:"center",inline:"nearest"}]);
  assert.deepEqual(row.tableScrolls,[{left:0,behavior:"smooth"}]);
  assert.equal(card.focuses.length,0);
});

test("mobile selection scrolls to the visible card rather than the hidden table", () => {
  const row = record("li-greenbushes",false,true), card = record("li-greenbushes",true);
  assert.equal(focusProjectRecord(root(row,card),"li-greenbushes"),true);
  assert.equal(row.scrolls.length,0);
  assert.equal(card.scrolls.length,1);
  assert.equal(card.focuses.length,1);
});

test("repeat clicks relocate the same project and reduced motion disables smooth scrolling", () => {
  const card = record("bisie",true);
  focusProjectRecord(root(card),"bisie",true);
  focusProjectRecord(root(card),"bisie",true);
  assert.equal(card.scrolls.length,2);
  assert.deepEqual(card.scrolls[1],{behavior:"auto",block:"center",inline:"nearest"});
});

test("missing or hidden records do not scroll to a different project or clear its highlight", () => {
  const existing = record("s11d",true), hidden = record("sishen",false);
  existing.highlighted = true;
  assert.equal(focusProjectRecord(root(existing,hidden),"unknown"),false);
  assert.equal(focusProjectRecord(root(existing,hidden),"sishen"),false);
  assert.equal(existing.highlighted,true);
  assert.equal(existing.focuses.length,0);
});
