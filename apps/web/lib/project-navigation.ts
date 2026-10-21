/** Scroll to the visible desktop row or mobile card for a map marker. */
export function focusProjectRecord(root: HTMLElement, projectId: string, reduceMotion = false) {
  const records = Array.from(root.querySelectorAll<HTMLElement>("[data-map-project]"));
  const matches = records.filter(record => record.dataset.mapProject === projectId);
  const target = matches.find(record => record.getClientRects().length > 0);
  if (!target) return false;

  for (const record of records) record.toggleAttribute("data-map-highlight", matches.includes(record));
  const behavior = reduceMotion ? "auto" : "smooth";
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior, block: "center", inline: "nearest" });
  // Keep the asset name visible if a wide research table was scrolled sideways.
  target.closest<HTMLElement>(".matrix-table-wrap")?.scrollTo({ left: 0, behavior });
  return true;
}
