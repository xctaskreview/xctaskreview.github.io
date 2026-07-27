# Import task ignore list

`importTaskIgnoreList.json` lists **XCDemon** and **CIVL Comps** task result URLs that cannot be imported (missing server-side result data or other blockers). The import dialogs filter these out so they never appear as selectable tasks.

Catalog pickers require an **IGC zip** on the listing page. Tasks on the ignore list are hidden. CIVL **events** stay visible; if every task in an event is non-importable, the task list is empty and the dialog explains why.

Each entry includes:

| Field | Meaning |
|--------|---------|
| `source` | `xcdemon` or `civl` |
| `taskResultUrl` | Canonical task results page URL (matched after normalization) |
| `label` | Task label on the league/event results page |
| `context` | League/event and season |
| `found` | What is present on the listing page |
| `missing` | What prevents import |

## Regenerate XCDemon entries

```bash
npx tsx scripts/generate-import-ignore-list.ts
```

This scans every archived league season on XCDemon, probes each task result URL, and rewrites `importTaskIgnoreList.json`. Tasks whose pages return “task result not found” (missing `-result.xml` on the server) are added.

### Ignore list file shape

```json
{
  "tasks": [ … ],
  "events": [ … ]
}
```

- **tasks**: task result URLs that cannot be parsed (mostly XCDemon missing XML).
- **events**: optional CIVL `…/results` URLs (not applied to the event picker; kept for audits / future use). Regenerating with `generate-civl-event-ignore-list.ts` is optional and does not hide events in the UI.

## Parser improvements (same change set)

- Shared coordinates: decimal lat/lon, Google Maps `@` links, CIVL `Lat:/Lon:`, and **UTM** (`44T 0320569 4966558`).
- XCDemon: lenient turnpoint table header matching (`No.` vs `No`), legacy tasks use `results_task.php` URLs, optional altitude cells.
- CIVL: coordinates from link text/href, optional altitude, lenient table headers.
