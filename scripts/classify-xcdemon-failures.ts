import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';

const w = new Window({ url: 'https://x/' });
globalThis.DOMParser = w.DOMParser;

const rows = readFileSync('scripts/audit-task-results.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
  .filter((r: { source: string }) => r.source === 'xcdemon');

let errorPage = 0;
let happyDomNoTh = 0;
let happyDomHasTh = 0;

let sampleUrl = '';
let sampleRawTh = 0;

for (const r of rows) {
  const html = await fetch(r.taskResultUrl).then((x) => x.text());
  const isError = /task result not found|Something went wrong while loading/i.test(html);
  if (isError) {
    errorPage += 1;
    continue;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const th = doc.querySelectorAll('th').length;
  if (th === 0) {
    happyDomNoTh += 1;
    if (!sampleUrl) {
      sampleUrl = r.taskResultUrl;
      sampleRawTh = (html.match(/<th/g) || []).length;
    }
  } else happyDomHasTh += 1;
}

console.log({ total: rows.length, errorPage, happyDomNoTh, happyDomHasTh, sampleUrl, sampleRawTh });
