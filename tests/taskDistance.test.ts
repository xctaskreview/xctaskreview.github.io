import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importSessionBundle } from '../src/lib/sessionBundle';
import { buildOptimizedRoute } from '../src/lib/xctask';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'xcdemon-680-2026-07-19-review.zip',
);

describe('potato hill task distance', () => {
  it('matches published race-to-goal distance', async () => {
    const buffer = readFileSync(fixturePath);
    const file = new File([buffer], 'x.zip', { type: 'application/zip' });
    const { session } = await importSessionBundle(file);
    const route = buildOptimizedRoute(session.task);

    expect(route.progressTotalDistance / 1000).toBeCloseTo(30.307, 1);
    expect(route.progressGoalApproachDistance).toBeCloseTo(599.960249995496, 2);
  });
});
