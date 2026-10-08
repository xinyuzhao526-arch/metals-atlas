import assert from "node:assert/strict";
import test from "node:test";
import { classify, parseOfficialLinks, parsePaiPaiEvents, parseRssItems } from "../scripts/update-news.mjs";

test("official news classifier keeps supply updates and separates metals", () => {
  assert.equal(classify("Pilgangoora quarterly lithium production results", "li"), "li");
  assert.equal(classify("Kamoa-Kakula copper production guidance update", "cu"), "cu");
  assert.equal(classify("Murrin Murrin nickel production results", "ni", true), "ni");
  assert.equal(classify("Board dividend announcement", "cu"), null);
  assert.equal(classify("Quarterly nickel production results", "li", true), null);
  assert.equal(classify("Quarterly lithium production results", "ni", true), null);
  assert.equal(classify("Open innovation project results", "ni", true), null);
});

test("RSS parser keeps real supply events and rejects price and financing stories", () => {
  const xml = `<rss><channel>
    <item><title>Copper mine suspends production after accident</title><link>https://media.test/copper-stop</link><pubDate>Wed, 07 Oct 2026 08:00:00 GMT</pubDate><description>Operations halted at the copper mine.</description></item>
    <item><title>Lithium price rallies on market outlook</title><link>https://media.test/lithium-price</link><pubDate>Wed, 07 Oct 2026 08:00:00 GMT</pubDate><description>Lithium price forecast.</description></item>
    <item><title>Nickel developer completes private placement</title><link>https://media.test/nickel-funding</link><pubDate>Wed, 07 Oct 2026 08:00:00 GMT</pubDate><description>Funding for a nickel expansion.</description></item>
  </channel></rss>`;
  const items = parseRssItems(xml, { organization:"Test Mining", url:"https://media.test/feed/" });
  assert.equal(items.length, 1);
  assert.equal(items[0].metal, "cu");
  assert.equal(items[0].tag, "供给扰动");
  assert.equal(items[0].date, "2026-10-07");
});

test("PaiPai event adapter imports only supported metals with media provenance", () => {
  const rows = parsePaiPaiEvents({ events:[{title:"Mine suspended",d:"2026-10-07",metals:["Cu","Fe"],src:"mining.com",tag:"供给扰动",links:[{url:"https://media.test/mine"}]}] });
  assert.deepEqual(rows, [{title:"Mine suspended",url:"https://media.test/mine",metal:"cu",date:"2026-10-07",organization:"mining.com",tag:"供给扰动"}]);
});

test("official link parser accepts only same-host relevant materials", () => {
  const html = '<a href="/news/pilgangoora-production">Pilgangoora quarterly production results</a><a href="https://example.com/story">Lithium production results</a><a href="/privacy">Privacy policy</a>';
  const items = parseOfficialLinks(html, { organization:"PLS", metal:"li", url:"https://pls.com/news", host:"pls.com" });
  assert.deepEqual(items, [{ title:"Pilgangoora quarterly production results", url:"https://pls.com/news/pilgangoora-production", metal:"li" }]);
});
