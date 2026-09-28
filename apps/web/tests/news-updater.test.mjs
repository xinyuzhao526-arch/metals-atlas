import assert from "node:assert/strict";
import test from "node:test";
import { classify, parseOfficialLinks } from "../scripts/update-news.mjs";

test("official news classifier keeps supply updates and separates metals", () => {
  assert.equal(classify("Pilgangoora quarterly lithium production results", "li"), "li");
  assert.equal(classify("Kamoa-Kakula copper production guidance update", "cu"), "cu");
  assert.equal(classify("Board dividend announcement", "cu"), null);
  assert.equal(classify("Quarterly nickel production results", "li", true), null);
});

test("official link parser accepts only same-host relevant materials", () => {
  const html = '<a href="/news/pilgangoora-production">Pilgangoora quarterly production results</a><a href="https://example.com/story">Lithium production results</a><a href="/privacy">Privacy policy</a>';
  const items = parseOfficialLinks(html, { organization:"PLS", metal:"li", url:"https://pls.com/news", host:"pls.com" });
  assert.deepEqual(items, [{ title:"Pilgangoora quarterly production results", url:"https://pls.com/news/pilgangoora-production", metal:"li" }]);
});
