import fs from 'node:fs';
import { lint } from '@google/design.md/linter';

const file = process.argv[2] ?? 'DESIGN.md';
const source = fs.readFileSync(file, 'utf8');
const report = lint(source);

console.log(JSON.stringify({
  file,
  summary: report.summary,
  findings: report.findings,
}, null, 2));

if (report.summary.errors > 0) {
  process.exit(1);
}
