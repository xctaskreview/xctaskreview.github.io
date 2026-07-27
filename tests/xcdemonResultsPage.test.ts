// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterIgnoredImportTasks, isIgnoredImportTaskUrl } from '../src/lib/importTaskIgnoreList';
import { parseXcdemonResultsPage } from '../src/lib/xcdemon';

const fixturePath = join(import.meta.dirname, 'fixtures/x-red-rocks-2025-results-snippet.html');

describe('parseXcdemonResultsPage legacy task links', () => {
  it('keeps X Red Rocks 2025 tasks using legacy task_result HTML URLs', () => {
    const html = readFileSync(fixturePath, 'utf8');
    const { tasks } = parseXcdemonResultsPage(html, 31);
    const redRocksTasks = tasks.filter((task) => task.taskId === '643');
    expect(redRocksTasks).toHaveLength(1);
    expect(redRocksTasks[0]?.taskResultUrl).toContain('task_result_643.html');
    expect(isIgnoredImportTaskUrl(redRocksTasks[0]!.taskResultUrl)).toBe(false);
    expect(filterIgnoredImportTasks(tasks).length).toBeGreaterThanOrEqual(1);
  });
});
