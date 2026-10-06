import { readFile } from 'node:fs/promises';
import { summarizeMetrics, metricsMarkdown } from '../metrics-report.mjs';
const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 2) argumentsByName.set(process.argv[index], process.argv[index + 1]);
const path = argumentsByName.get('--input');
if (!path || !argumentsByName.get('--from') || !argumentsByName.get('--to')) {
  throw new Error('用法：node cloudbase/scripts/metrics-report.mjs --input 本项目导出.json --from YYYY-MM-DD --to YYYY-MM-DD [--as-of YYYY-MM-DD] [--cohort-from YYYY-MM-DD --cohort-to YYYY-MM-DD] [--format json|markdown]');
}
const report = summarizeMetrics(JSON.parse(await readFile(path, 'utf8')), {
  from: argumentsByName.get('--from'), to: argumentsByName.get('--to'), asOf: argumentsByName.get('--as-of') || argumentsByName.get('--to'),
  cohortFrom: argumentsByName.get('--cohort-from') || argumentsByName.get('--from'), cohortTo: argumentsByName.get('--cohort-to') || argumentsByName.get('--to'),
});
process.stdout.write(argumentsByName.get('--format') === 'json' ? JSON.stringify(report, null, 2) + '\n' : metricsMarkdown(report));
