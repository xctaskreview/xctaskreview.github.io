import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIgc, pilotCompactDisplayName, resolvePilotDisplayName } from '../src/lib/igc';

describe('pilotCompactDisplayName', () => {
  it('returns the sole name unchanged', () => {
    expect(pilotCompactDisplayName('Sheth')).toBe('Sheth');
  });

  it('uses first name plus initials for additional parts', () => {
    expect(pilotCompactDisplayName('Pablo Nahuel Rodriguez Merlo')).toBe('Pablo N. R. M.');
    expect(pilotCompactDisplayName('Klaus Ashorn')).toBe('Klaus A.');
  });
});

describe('resolvePilotDisplayName', () => {
  it('strips XCDemon competition ids from file names', () => {
    expect(resolvePilotDisplayName('', 'Eyal Posener.1165.146.igc')).toBe('Eyal Posener');
    expect(resolvePilotDisplayName('Eyal Posener', 'Eyal Posener.1165.146.igc')).toBe('Eyal Posener');
  });

  it('prefers the file name when the header is incomplete', () => {
    expect(resolvePilotDisplayName('klaus', 'Klaus Ashorn.1011.165.igc')).toBe('Klaus Ashorn');
  });

  it('prefers the file name when the header does not match the upload name', () => {
    expect(resolvePilotDisplayName('KaranS', 'Sheth.1196.174.igc')).toBe('Sheth');
  });

  it('humanizes CIVL-style file names with a date prefix', () => {
    const fileName = '2026-03-21-PABLO-NAHUEL-RODRIGUEZ-MERLO.76109.IGC';
    expect(resolvePilotDisplayName('', fileName)).toBe('Pablo Nahuel Rodriguez Merlo');
    expect(resolvePilotDisplayName(fileName, fileName)).toBe('Pablo Nahuel Rodriguez Merlo');
  });

  it('parses Potato Hill 680 IGC zip pilots', () => {
    const zipPath = '/Users/eyal/Downloads/2026-07-19_680-igcs (1).zip';
    try {
      readFileSync(zipPath);
    } catch {
      return;
    }

    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const dir = '/tmp/igc680-pilot-test';
    execSync(`unzip -qo ${JSON.stringify(zipPath)} -d ${JSON.stringify(dir)}`);

    const expected: Record<string, string> = {
      '(Bruno) Subarno.1177.131.igc': '(Bruno) Subarno',
      'Klaus Ashorn.1011.165.igc': 'Klaus Ashorn',
      'Sheth.1196.174.igc': 'Sheth',
      'casey gerstle.1019.124.igc': 'Casey Gerstle',
    };

    for (const [file, pilot] of Object.entries(expected)) {
      const track = parseIgc(readFileSync(`${dir}/${file}`, 'utf8'), file);
      expect(track.pilotName).toBe(pilot);
    }

    for (const file of readdirSync(dir).filter((name) => name.endsWith('.igc'))) {
      const track = parseIgc(readFileSync(`${dir}/${file}`, 'utf8'), file);
      expect(track.pilotName).not.toMatch(/\.\d+\.\d+$/);
      expect(track.pilotName).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });
});
