# Implemented contract claims

These rows track the clauses completed in the 18 October 2026 round; the complete product status remains in CONTRACT.md.

| Clause | Status | Proven behavior | Evidence |
| --- | --- | --- | --- |
| CALC-002 | done | Conditional scalar and collection lookups, current policy, next-read recomputation, labeled CSV and native copies; builder and record journeys at 1440/390. | `tests/helpers/records-lookups-journey.mjs`, `tests/helpers/records-collection-lookups.mjs`, `tests/helpers/records-collection-browser.mjs`, `docs/contract/CALC-002/` |
| IFACE-006 | done | Nine editable starting templates; six operations adoption/edit journeys and reviewed whole-base copies with or without records, identity remapping and disclosed record-dependent exclusions; browser journeys at 1440/390. | `tests/helpers/records-operations-templates.mjs`, `tests/helpers/records-browser-templates.mjs`, `docs/contract/IFACE-006/` |
| VIEW-010 | done | Month/week/day date and instant calendars, DST-preserving audited moves, stale/readonly refusal and private revocable iCal feeds; product journeys at 1440/390. | `tests/ui-records-calendar.mjs`, `tests/helpers/records-calendar-feed.mjs`, `src/ui/records/record-calendar.tsx`, `src/domains/records/calendar-feed.server.ts` |
