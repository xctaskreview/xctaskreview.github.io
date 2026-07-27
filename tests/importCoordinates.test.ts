// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { parseImportCoordinates, parseUtmCoordinates } from '../src/lib/importCoordinates';
import { parseXcdemonTaskPage } from '../src/lib/xcdemon';

describe('parseImportCoordinates', () => {
  it('parses CIVL UTM coordinates', () => {
    const { lat, lon } = parseUtmCoordinates('44T 0320569 4966558');
    expect(lat).toBeGreaterThan(40);
    expect(lat).toBeLessThan(50);
    expect(lon).toBeGreaterThan(70);
    expect(lon).toBeLessThan(85);
  });

  it('parses decimal lat/lon pairs', () => {
    expect(parseImportCoordinates('37.5188, -118.29373')).toEqual({
      lat: 37.5188,
      lon: -118.29373,
    });
  });
});

describe('parseXcdemonTaskPage legacy HTML', () => {
  it('parses turnpoints when altitude cells are blank', () => {
    const html = `
      <table>
        <thead><tr>
          <th>No.</th><th>Dist.</th><th>Id</th><th>Radius</th><th>Open</th><th>Close</th><th>Coordinates</th><th>Altitude</th>
        </tr></thead>
        <tbody><tr>
          <td>1 SS</td><td>0</td><td>PAIUTE</td><td>2000m</td><td>12:40</td><td>20:00</td>
          <td><a href="http://maps.google.com/maps?q=@37.5188,-118.29373">37.5188, -118.29373</a></td>
          <td>m</td>
        </tr></tbody>
      </table>`;

    const task = parseXcdemonTaskPage(html, {
      location: 'Owens Valley',
      date: '2016-09-26',
      taskId: '68',
    });

    expect(task.turnpoints).toHaveLength(1);
    expect(task.turnpoints[0].waypoint.lat).toBeCloseTo(37.5188, 4);
  });
});
