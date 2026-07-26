// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  buildArchivedLeagueCatalog,
  buildArchivedSeasonCatalog,
  parseArchivedLeagueSeasons,
  parseXcdemonArchivedLeaguesPage,
} from '../src/lib/xcdemon';

const archivedSnippet = `
<h1>All Leagues</h1><ul>
<li><a href="/index.php?leagueappid=39&id=pilots">Bozeman XC League</a></li>
<ul><li>2023-04-01 to 2023-08-31</li></ul>
<li><a href="/index.php?leagueappid=38&id=pilots">Hatcher Hike n Fly</a></li>
<ul>
<li>2025-06-20 to 2025-06-30</li>
<li>2024-07-06 to 2024-07-08</li>
<li>2023-06-22 to 2023-06-24</li>
</ul>
<li><a href="/index.php?leagueappid=37&id=pilots">Santa Barbara Foreplay</a></li>
<ul>
<li>2023-11-15 to 2023-11-22</li>
<li>2022-11-01 to 2022-11-30</li>
</ul>
</ul>`;

describe('parseArchivedLeagueSeasons', () => {
  it('extracts league seasons from archived leagues markup', () => {
    const doc = new DOMParser().parseFromString(archivedSnippet, 'text/html');
    const raw = parseArchivedLeagueSeasons(doc);

    expect(raw).toHaveLength(6);
    expect(raw[0]).toMatchObject({
      leagueId: 39,
      leagueName: 'Bozeman XC League',
      startDate: '2023-04-01',
      endDate: '2023-08-31',
    });
  });
});

describe('buildArchivedSeasonCatalog', () => {
  it('uses year-only labels when seasons span distinct years', () => {
    const doc = new DOMParser().parseFromString(archivedSnippet, 'text/html');
    const catalog = buildArchivedSeasonCatalog(parseArchivedLeagueSeasons(doc));

    expect(catalog.find((entry) => entry.leagueId === 38 && entry.year === 2025)?.label).toBe(
      'Hatcher Hike n Fly · 2025',
    );
    expect(catalog.find((entry) => entry.leagueId === 39)?.label).toBe('Bozeman XC League · 2023');
  });

  it('uses start date labels when a league has multiple seasons in the same year', () => {
    const doc = new DOMParser().parseFromString(
      `<h1>All Leagues</h1><ul>
        <li><a href="/index.php?leagueappid=99&id=pilots">Same Year League</a></li>
        <ul>
          <li>2024-06-01 to 2024-06-15</li>
          <li>2024-09-01 to 2024-09-15</li>
        </ul>
      </ul>`,
      'text/html',
    );
    const catalog = buildArchivedSeasonCatalog(parseArchivedLeagueSeasons(doc));

    expect(catalog.map((entry) => entry.label)).toEqual([
      'Same Year League · 2024-09-01',
      'Same Year League · 2024-06-01',
    ]);
  });

  it('sorts entries by most recent start date first', () => {
    const doc = new DOMParser().parseFromString(archivedSnippet, 'text/html');
    const catalog = parseXcdemonArchivedLeaguesPage(doc.documentElement.outerHTML);

    expect(catalog.map((entry) => entry.startDate)).toEqual([
      '2025-06-20',
      '2024-07-06',
      '2023-11-15',
      '2023-06-22',
      '2023-04-01',
      '2022-11-01',
    ]);
  });
});

describe('buildArchivedLeagueCatalog', () => {
  it('lists each league once, ordered by most recent season', () => {
    const doc = new DOMParser().parseFromString(archivedSnippet, 'text/html');
    const seasons = buildArchivedSeasonCatalog(parseArchivedLeagueSeasons(doc));
    const leagues = buildArchivedLeagueCatalog(seasons);

    expect(leagues.map((league) => league.leagueName)).toEqual([
      'Hatcher Hike n Fly',
      'Santa Barbara Foreplay',
      'Bozeman XC League',
    ]);
    expect(leagues[0]?.defaultYear).toBe(2025);
    expect(leagues[2]?.defaultYear).toBe(2023);
  });
});
