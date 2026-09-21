# Public data layer

This directory is the versioned, publishable data contract for the public site.

- Stable IDs join projects, facts, events, and sources.
- Every published fact has a `source_id`; multi-source events may also have `source_ids`.
- Missing numeric values stay `null` and carry a machine-readable `missing_reason`.
- Sources retain organization, title, publication date, verification date, URL, and locator.
- Only independent summaries and short excerpts belong here. Do not add downloaded media, cookies, credentials, local paths, or internal review notes.
- Database-backed facts may be regenerated from the public API. Editorial records such as ownership and events remain version-controlled until a later schema explicitly supports them.

The current files cover 44 copper projects. Las Bambas and Kansanshi have independently sourced production, guidance, and reserve facts; the other projects remain visible with explicit coverage gaps. Inventory snapshots are limited to values that can be safely attributed and redistributed. Pending exchange definitions stay `null`; the UI must never turn them into zeroes or join incompatible definitions.
