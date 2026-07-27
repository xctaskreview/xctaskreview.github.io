import { describe, expect, it } from 'vitest';
import {
  extractXcdemonTaskId,
  filterImportableCatalogTasks,
  isIgnoredImportTaskUrl,
} from '../src/lib/importTaskIgnoreList';

describe('isIgnoredImportTaskUrl', () => {
  it('matches legacy X Lost Idaho task URLs when the broken php link is ignored', () => {
    expect(
      isIgnoredImportTaskUrl(
        'https://xcdemon.com/results_task.php?leagueappid=41&task_id=670',
      ),
    ).toBe(true);
    expect(
      isIgnoredImportTaskUrl('https://xcdemon.com/task_result_670.html?leagueappid=41'),
    ).toBe(true);
  });

  it('does not ignore importable Red Rocks legacy task URLs', () => {
    expect(isIgnoredImportTaskUrl('https://xcdemon.com/task_result_643.html?leagueappid=31')).toBe(
      false,
    );
  });
});

describe('filterImportableCatalogTasks', () => {
  it('drops tasks without IGC zips or on the ignore list', () => {
    const tasks = filterImportableCatalogTasks([
      {
        taskResultUrl: 'https://xcdemon.com/task_result_670.html?leagueappid=41',
        igcZipUrl: 'https://xcdemon.com/tracklogs/670.zip',
      },
      {
        taskResultUrl: 'https://xcdemon.com/task_result_643.html?leagueappid=31',
        igcZipUrl: 'https://xcdemon.com/tracklogs/643.zip',
      },
      {
        taskResultUrl: 'https://xcdemon.com/task_result_999.html',
        igcZipUrl: null,
      },
    ]);
    expect(tasks.map((t) => extractXcdemonTaskId(t.taskResultUrl))).toEqual(['643']);
  });
});
